"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predictionMarketPlugin = void 0;
const evaluatePrediction_1 = require("./actions/evaluatePrediction");
const multiLLMConsensus_1 = require("./providers/multiLLMConsensus");
const predictionMarket_1 = require("./evaluators/predictionMarket");
/**
 * Prediction Market Plugin for ElizaOS
 * Provides AI oracle functionality for blockchain prediction markets
 */
exports.predictionMarketPlugin = {
    name: "prediction-market",
    description: "AI Oracle plugin for prediction market evaluation and consensus",
    actions: [evaluatePrediction_1.evaluatePredictionAction],
    providers: [multiLLMConsensus_1.multiLLMConsensusProvider],
    evaluators: [predictionMarket_1.predictionMarketEvaluator],
    clients: []
};
exports.default = exports.predictionMarketPlugin;
