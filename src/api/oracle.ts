import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

interface OracleRequest {
  prompt: string;
  provider: string;
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
}

interface OracleResponse {
  optionATrue: boolean;
  optionBTrue: boolean;
  confidence: number;
  reasoning: string;
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many oracle requests, please try again later'
});

// API key validation
const validateApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  const validApiKey = process.env.ELIZAOS_API_KEY;
  
  if (!validApiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// LLM Provider configurations
const LLM_CONFIGS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    headers: (apiKey: string) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    headers: (apiKey: string) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    headers: (apiKey: string) => ({
      'Content-Type': 'application/json'
    })
  }
};

async function callLLMProvider(
  provider: string,
  model: string,
  apiKey: string,
  prompt: string,
  maxTokens: number = 500,
  temperature: number = 0.1
): Promise<string> {
  const config = LLM_CONFIGS[provider as keyof typeof LLM_CONFIGS];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  let requestBody: any;
  let endpoint = config.endpoint;

  switch (provider) {
    case 'openai':
    case 'deepseek':
      requestBody = {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are an AI oracle for prediction markets. Respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: temperature
      };
      break;

    case 'gemini':
      endpoint = `${config.endpoint}?key=${apiKey}`;
      requestBody = {
        contents: [{
          parts: [{
            text: `You are an AI oracle for prediction markets. Respond with valid JSON only.\n\n${prompt}`
          }]
        }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: temperature
        }
      };
      break;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const headers = config.headers(apiKey);
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`${provider} API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  
  // Extract text based on provider format
  let text: string;
  switch (provider) {
    case 'openai':
    case 'deepseek':
      text = data.choices?.[0]?.message?.content || '';
      break;
    case 'gemini':
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      break;
    default:
      throw new Error(`Unknown response format for provider: ${provider}`);
  }

  return text;
}

function parseOracleResponse(text: string): OracleResponse {
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  
  // Validate response structure
  if (typeof parsed.optionATrue !== 'boolean' || 
      typeof parsed.optionBTrue !== 'boolean' ||
      typeof parsed.confidence !== 'number' ||
      typeof parsed.reasoning !== 'string') {
    throw new Error('Invalid response structure');
  }

  // Ensure confidence is between 0 and 1
  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

  return {
    optionATrue: parsed.optionATrue,
    optionBTrue: parsed.optionBTrue,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning
  };
}

export function createOracleAPI(): express.Router {
  const router = express.Router();

  // Apply middleware
  router.use(cors());
  router.use(limiter);
  router.use(validateApiKey);
  router.use(express.json({ limit: '10mb' }));

  // Oracle evaluation endpoint
  router.post('/oracle/evaluate', async (req: express.Request, res: express.Response) => {
    try {
      const { prompt, provider, model, apiKey, maxTokens, temperature }: OracleRequest = req.body;

      if (!prompt || !provider || !model || !apiKey) {
        return res.status(400).json({ 
          error: 'Missing required fields: prompt, provider, model, apiKey' 
        });
      }

      console.log(`Oracle request: ${provider}/${model}`);
      console.log(`Prompt length: ${prompt.length} characters`);

      // Call the specified LLM provider
      const rawResponse = await callLLMProvider(
        provider,
        model,
        apiKey,
        prompt,
        maxTokens,
        temperature
      );

      console.log(`Raw response from ${provider}: ${rawResponse.substring(0, 200)}...`);

      // Parse and validate the response
      const oracleResponse = parseOracleResponse(rawResponse);

      console.log(`Parsed response:`, oracleResponse);

      // Return the structured response
      res.json(oracleResponse);

    } catch (error) {
      console.error('Oracle evaluation error:', error);
      
      res.status(500).json({
        error: 'Oracle evaluation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Health check endpoint
  router.get('/oracle/health', (req: express.Request, res: express.Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // Consensus endpoint (calls multiple providers)
  router.post('/oracle/consensus', async (req: express.Request, res: express.Response) => {
    try {
      const { prompt, providers, maxTokens, temperature } = req.body;

      if (!prompt || !providers || !Array.isArray(providers)) {
        return res.status(400).json({ 
          error: 'Missing required fields: prompt, providers array' 
        });
      }

      console.log(`Consensus request for ${providers.length} providers`);

      const responses: Array<{ provider: string; response: OracleResponse; error?: string }> = [];

      // Call each provider
      for (const providerConfig of providers) {
        try {
          const rawResponse = await callLLMProvider(
            providerConfig.provider,
            providerConfig.model,
            providerConfig.apiKey,
            prompt,
            maxTokens,
            temperature
          );

          const oracleResponse = parseOracleResponse(rawResponse);
          
          responses.push({
            provider: providerConfig.provider,
            response: oracleResponse
          });

        } catch (error) {
          console.error(`Error with provider ${providerConfig.provider}:`, error);
          responses.push({
            provider: providerConfig.provider,
            response: {
              optionATrue: false,
              optionBTrue: false,
              confidence: 0,
              reasoning: 'Provider error'
            },
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Calculate consensus
      const validResponses = responses.filter(r => !r.error && r.response.confidence >= 0.7);
      
      if (validResponses.length === 0) {
        return res.status(500).json({
          error: 'No valid responses from providers',
          responses: responses
        });
      }

      let optionAVotes = 0;
      let optionBVotes = 0;
      let totalConfidence = 0;
      const reasonings: string[] = [];

      for (const { provider, response } of validResponses) {
        if (response.optionATrue && !response.optionBTrue) {
          optionAVotes++;
        } else if (response.optionBTrue && !response.optionATrue) {
          optionBVotes++;
        }

        totalConfidence += response.confidence;
        reasonings.push(`${provider}: ${response.reasoning}`);
      }

      const avgConfidence = totalConfidence / validResponses.length;
      const consensusThreshold = Math.ceil(validResponses.length / 2);

      const consensus = {
        optionATrue: optionAVotes >= consensusThreshold,
        optionBTrue: optionBVotes >= consensusThreshold,
        confidence: avgConfidence,
        reasoning: reasonings.join('; '),
        votes: {
          optionA: optionAVotes,
          optionB: optionBVotes
        },
        providers: validResponses.map(r => r.provider),
        allResponses: responses
      };

      console.log('Consensus result:', consensus);

      res.json(consensus);

    } catch (error) {
      console.error('Consensus evaluation error:', error);
      
      res.status(500).json({
        error: 'Consensus evaluation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
} 