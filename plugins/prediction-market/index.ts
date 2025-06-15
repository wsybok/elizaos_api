import {
  Action,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  State,
  HandlerCallback,
  ModelClass,
  Character,
  Evaluator
} from "@elizaos/core";

import { evaluatePredictionAction } from "./actions/evaluatePrediction";
import { multiLLMConsensusProvider } from "./providers/multiLLMConsensus";
import { predictionMarketEvaluator } from "./evaluators/predictionMarket";

/**
 * Prediction Market Plugin for ElizaOS
 * Provides AI oracle functionality for blockchain prediction markets
 */
export const predictionMarketPlugin: Plugin = {
  name: "prediction-market",
  description: "AI Oracle plugin for prediction market evaluation and consensus",
  actions: [evaluatePredictionAction],
  providers: [multiLLMConsensusProvider],
  evaluators: [predictionMarketEvaluator],
  clients: []
};

export default predictionMarketPlugin; 