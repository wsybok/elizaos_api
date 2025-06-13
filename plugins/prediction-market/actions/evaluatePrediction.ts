import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ModelClass,
  Content
} from "@elizaos/core";
import { v4 as uuidv4 } from 'uuid';

interface PredictionEvaluationContent extends Content {
  question: string;
  optionA: string;
  optionB: string;
  providers?: string[];
}

interface LLMProvider {
  name: string;
  model: string;
  apiKey?: string;
}

interface ProviderResponse {
  provider: string;
  model: string;
  optionATrue: boolean;
  optionBTrue: boolean;
  confidence: number;
  reasoning: string;
}

interface ConsensusResult {
  optionATrue: boolean;
  optionBTrue: boolean;
  confidence: number;
  reasoning: string;
  providers: string[];
  votes: {
    optionA: number;
    optionB: number;
  };
}

const LLM_PROVIDERS: LLMProvider[] = [
  {
    name: "openai",
    model: "gpt-4"
  },
  {
    name: "deepseek",
    model: "deepseek-chat"
  },
  {
    name: "gemini", 
    model: "gemini-1.5-flash"
  }
];

const CONSENSUS_THRESHOLD = 2;
const MIN_CONFIDENCE = 0.7;

async function callLLMProvider(
  runtime: IAgentRuntime,
  provider: LLMProvider,
  question: string,
  optionA: string,
  optionB: string
): Promise<ProviderResponse | null> {
  const prompt = `
You are an AI oracle tasked with evaluating prediction market outcomes based on available information.

Question: ${question}
Option A: ${optionA}
Option B: ${optionB}

Please analyze the question and determine which option is more likely to be true based on:
1. Current factual information
2. Historical trends
3. Logical reasoning
4. Available evidence

Respond with a JSON object containing:
{
  "optionATrue": boolean (true if Option A is more likely),
  "optionBTrue": boolean (true if Option B is more likely), 
  "confidence": number (0-1, confidence in your assessment),
  "reasoning": "string (brief explanation of your reasoning)"
}

Important: 
- Only one option can be true unless the question allows for both
- If uncertain or evidence is insufficient, set confidence < 0.7
- Provide clear, factual reasoning
`;

  try {
    // Get API key from environment
    const apiKey = process.env[`${provider.name.toUpperCase()}_API_KEY`];
    
    if (!apiKey) {
      console.warn(`No API key configured for ${provider.name}`);
      return null;
    }

    let response: string;
    
    // Call different providers using their APIs
    switch (provider.name) {
      case 'openai':
        response = await callOpenAI(apiKey, provider.model, prompt);
        break;
      case 'deepseek':
        response = await callDeepSeek(apiKey, provider.model, prompt);
        break;
      case 'gemini':
        response = await callGemini(apiKey, provider.model, prompt);
        break;
      default:
        console.warn(`Unsupported provider: ${provider.name}`);
        return null;
    }

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`No JSON found in ${provider.name} response`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate response structure
    if (typeof parsed.optionATrue !== 'boolean' || 
        typeof parsed.optionBTrue !== 'boolean' ||
        typeof parsed.confidence !== 'number' ||
        typeof parsed.reasoning !== 'string') {
      console.error(`Invalid response structure from ${provider.name}`);
      return null;
    }

    return {
      provider: provider.name,
      model: provider.model,
      optionATrue: parsed.optionATrue,
      optionBTrue: parsed.optionBTrue,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning
    };

  } catch (error) {
    console.error(`Error calling ${provider.name}:`, error);
    return null;
  }
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: 'You are an AI oracle for prediction markets. Respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.1
    })
  });

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function callDeepSeek(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: 'You are an AI oracle for prediction markets. Respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.1
    })
  });

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are an AI oracle for prediction markets. Respond with valid JSON only.\n\n${prompt}`
        }]
      }],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.1
      }
    })
  });

  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function getConsensus(
  runtime: IAgentRuntime,
  question: string,
  optionA: string,
  optionB: string,
  enabledProviders?: string[]
): Promise<ConsensusResult> {
  const responses: ProviderResponse[] = [];
  
  // Filter providers if specific ones are requested
  const providersToUse = enabledProviders 
    ? LLM_PROVIDERS.filter(p => enabledProviders.includes(p.name))
    : LLM_PROVIDERS;

  // Collect responses from all providers
  for (const provider of providersToUse) {
    const response = await callLLMProvider(runtime, provider, question, optionA, optionB);
    if (response && response.confidence >= MIN_CONFIDENCE) {
      responses.push(response);
    }
  }

  if (responses.length === 0) {
    throw new Error("No valid responses received from AI providers");
  }

  // Calculate consensus
  let optionAVotes = 0;
  let optionBVotes = 0;
  let totalConfidence = 0;
  const reasonings: string[] = [];
  const usedProviders: string[] = [];

  for (const response of responses) {
    if (response.optionATrue && !response.optionBTrue) {
      optionAVotes++;
    } else if (response.optionBTrue && !response.optionATrue) {
      optionBVotes++;
    }

    totalConfidence += response.confidence;
    reasonings.push(`${response.provider}: ${response.reasoning}`);
    usedProviders.push(response.provider);
  }

  const avgConfidence = totalConfidence / responses.length;
  const optionAConsensus = optionAVotes >= CONSENSUS_THRESHOLD;
  const optionBConsensus = optionBVotes >= CONSENSUS_THRESHOLD;

  return {
    optionATrue: optionAConsensus,
    optionBTrue: optionBConsensus,
    confidence: avgConfidence,
    reasoning: reasonings.join('; '),
    providers: usedProviders,
    votes: {
      optionA: optionAVotes,
      optionB: optionBVotes
    }
  };
}

export const evaluatePredictionAction: Action = {
  name: "EVALUATE_PREDICTION",
  similes: ["ORACLE_EVALUATE", "PREDICT_OUTCOME", "ANALYZE_MARKET"],
  description: "Evaluates prediction market questions using multi-LLM consensus",
  
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const content = message.content as PredictionEvaluationContent;
    return !!(content.question && content.optionA && content.optionB);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    try {
      const content = message.content as PredictionEvaluationContent;
      
      console.log(`Evaluating prediction: ${content.question}`);
      console.log(`Option A: ${content.optionA}`);
      console.log(`Option B: ${content.optionB}`);

      // Get consensus from multiple LLMs
      const consensus = await getConsensus(
        runtime,
        content.question,
        content.optionA,
        content.optionB,
        content.providers
      );

      // Format response
      const resultText = `AI Consensus Result:

Question: ${content.question}
Result: Option ${consensus.optionATrue ? 'A' : (consensus.optionBTrue ? 'B' : 'Neither')} more likely
Confidence: ${Math.round(consensus.confidence * 100)}%
Providers: ${consensus.providers.join(', ')}
Votes: A=${consensus.votes.optionA}, B=${consensus.votes.optionB}

Reasoning: ${consensus.reasoning}`;

      // Store evaluation result in memory
      await runtime.messageManager.createMemory({
        userId: message.userId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        content: {
          text: resultText,
          question: content.question,
          optionA: content.optionA,
          optionB: content.optionB,
          consensus: consensus,
          action: "prediction_evaluated"
        },
        createdAt: Date.now()
      });

      if (callback) {
        callback({
          text: resultText,
          content: consensus,
          action: "EVALUATE_PREDICTION"
        });
      }

      return true;

    } catch (error: any) {
      console.error("Error in evaluatePredictionAction:", error);
      
      const errorMessage = `Error evaluating prediction: ${error?.message || 'Unknown error'}`;
      
      if (callback) {
        callback({
          text: errorMessage,
          error: error?.message || 'Unknown error'
        });
      }
      
      return false;
    }
  },

  examples: [
    [
      {
        user: "user",
        content: {
          text: "Evaluate this prediction: Will Bitcoin reach $100,000 by end of 2025?",
          question: "Will Bitcoin reach $100,000 by end of 2025?",
          optionA: "Bitcoin will reach $100,000 by December 31, 2025",
          optionB: "Bitcoin will not reach $100,000 by December 31, 2025"
        }
      },
      {
        user: "oracle",
        content: {
          text: "Analyzing Bitcoin price prediction...\n\nEvaluating multiple market factors and historical data to determine likelihood of Bitcoin reaching $100,000 by end of 2025.",
          action: "EVALUATE_PREDICTION"
        }
      }
    ]
  ]
}; 