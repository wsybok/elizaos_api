import {
  Evaluator,
  IAgentRuntime,
  Memory,
  State
} from "@elizaos/core";

export const predictionMarketEvaluator: Evaluator = {
  name: "PREDICTION_MARKET",
  similes: ["ORACLE", "MARKET_EVALUATION", "CONSENSUS"],
  description: "Evaluates the quality and reliability of prediction market assessments",
  
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // Check if this is a prediction market related message
    const content = message.content;
    if (typeof content === 'object' && content !== null) {
      const hasQuestion = 'question' in content;
      const hasOptions = 'optionA' in content && 'optionB' in content;
      return hasQuestion && hasOptions;
    }
    return false;
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // Evaluate the prediction market assessment
    const content = message.content as any;
    
    if (content.consensus) {
      const consensus = content.consensus;
      
      // Evaluate consensus quality
      const hasStrongConsensus = consensus.confidence > 0.8;
      const hasMultipleProviders = consensus.providers && consensus.providers.length >= 2;
      const hasReasonableVotes = consensus.votes && 
        (consensus.votes.optionA > 0 || consensus.votes.optionB > 0);
      
      const quality = hasStrongConsensus && hasMultipleProviders && hasReasonableVotes 
        ? "high" : "medium";
      
      return {
        score: hasStrongConsensus ? 0.9 : 0.7,
        quality: quality,
        reasoning: `Consensus evaluation: confidence=${consensus.confidence}, providers=${consensus.providers?.length || 0}, votes=A:${consensus.votes?.optionA || 0}/B:${consensus.votes?.optionB || 0}`
      };
    }
    
    return {
      score: 0.5,
      quality: "unknown",
      reasoning: "No consensus data available for evaluation"
    };
  },

  examples: []
}; 