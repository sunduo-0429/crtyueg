
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { RepaymentRow } from "../types";

/**
 * Uses Gemini API to analyze the repayment schedule and provide expert insights.
 */
export const analyzeSchedule = async (schedule: RepaymentRow[], query: string) => {
  // Always initialize GoogleGenAI inside the function to ensure the latest API key is used
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Create context from the first part of the schedule
  const scheduleContext = schedule.slice(0, 10).map(r => 
    `Period ${r.period}: ${r.date}, Principal: ${r.principal}, Interest: ${r.interest}, Balance: ${r.remainingBalance}`
  ).join('\n');

  const prompt = `
    You are a loan expert. Below is a summary of a repayment schedule:
    ${scheduleContext}
    ... (Total periods: ${schedule.length})
    
    User Question: ${query}
    
    Please provide a concise, helpful analysis based on the schedule provided.
  `;

  try {
    // Generate content using the recommended Gemini 3 model for reasoning tasks
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    // Access the text property directly from the response
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I'm sorry, I couldn't analyze the schedule right now.";
  }
};
