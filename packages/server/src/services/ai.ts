import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type {
  Question,
  QuestionCategory,
  QuestionDifficulty,
  AIQuestionRequest
} from '@trivia-millionaire/shared';
import { generateQuestionId } from '@trivia-millionaire/shared';

export interface AIConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  litellmBaseUrl?: string;
  litellmApiKey?: string;
  defaultModel?: string;
}

export class AIQuestionGenerator {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private litellm?: OpenAI;
  private defaultModel: string;

  constructor(config: AIConfig) {
    // Prioritize LiteLLM if configured
    if (config.litellmBaseUrl && config.litellmApiKey) {
      this.litellm = new OpenAI({
        apiKey: config.litellmApiKey,
        baseURL: config.litellmBaseUrl
      });
      console.log(`✅ LiteLLM configured: ${config.litellmBaseUrl}`);
    } else {
      // Fall back to native providers
      if (config.openaiApiKey && !config.openaiApiKey.startsWith('your-')) {
        this.openai = new OpenAI({ apiKey: config.openaiApiKey });
        console.log('✅ OpenAI configured');
      }

      if (config.anthropicApiKey && !config.anthropicApiKey.startsWith('your-')) {
        this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
        console.log('✅ Anthropic configured');
      }
    }

    this.defaultModel = config.defaultModel || 'gpt-3.5-turbo';
  }

  /**
   * Generate trivia questions using AI
   */
  async generateQuestions(request: AIQuestionRequest): Promise<Question[]> {
    // Prioritize LiteLLM if available
    if (this.litellm) {
      return this.generateWithLiteLLM(request);
    }

    const provider = request.provider || this.detectProvider();

    if (provider === 'anthropic') {
      return this.generateWithAnthropic(request);
    } else if (provider === 'openai') {
      return this.generateWithOpenAI(request);
    } else {
      // Fallback to available provider
      if (this.openai) {
        return this.generateWithOpenAI(request);
      } else if (this.anthropic) {
        return this.generateWithAnthropic(request);
      } else {
        throw new Error('No AI provider configured. Please set LITELLM_BASE_URL and LITELLM_API_KEY, or OPENAI_API_KEY, or ANTHROPIC_API_KEY in your .env file.');
      }
    }
  }

  /**
   * Generate questions using LiteLLM (OpenAI-compatible API)
   */
  private async generateWithLiteLLM(request: AIQuestionRequest): Promise<Question[]> {
    if (!this.litellm) {
      throw new Error('LiteLLM not configured');
    }

    const prompt = this.buildPrompt(request);

    try {
      const completion = await this.litellm.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are a trivia question generator. Generate questions in valid JSON format only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        // Some LiteLLM backends may not support response_format
        // response_format: { type: 'json_object' }
      });

      const content = completion.choices[0]?.message?.content || '';
      return this.parseAIResponse(content, request);
    } catch (error) {
      console.error('Error generating questions with LiteLLM:', error);
      throw error;
    }
  }

  /**
   * Generate questions using OpenAI
   */
  private async generateWithOpenAI(request: AIQuestionRequest): Promise<Question[]> {
    if (!this.openai) {
      throw new Error('OpenAI not configured');
    }

    const prompt = this.buildPrompt(request);

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel.startsWith('gpt') ? this.defaultModel : 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a trivia question generator. Generate questions in valid JSON format only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return this.parseAIResponse(content, request);
    } catch (error) {
      console.error('Error generating questions with OpenAI:', error);
      throw error;
    }
  }

  /**
   * Generate questions using Anthropic Claude
   */
  private async generateWithAnthropic(request: AIQuestionRequest): Promise<Question[]> {
    if (!this.anthropic) {
      throw new Error('Anthropic not configured');
    }

    const prompt = this.buildPrompt(request);

    try {
      const message = await this.anthropic.messages.create({
        model: this.defaultModel.startsWith('claude') ? this.defaultModel : 'claude-3-sonnet-20240229',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Invalid response type from Anthropic');
      }

      return this.parseAIResponse(content.text, request);
    } catch (error) {
      console.error('Error generating questions with Anthropic:', error);
      throw error;
    }
  }

  /**
   * Build prompt for AI
   */
  private buildPrompt(request: AIQuestionRequest): string {
    const { count, category, difficulty, topic, docs } = request;

    let prompt = `Generate ${count} multiple-choice trivia question(s) with exactly 4 answer choices each.`;

    if (topic) {
      prompt += ` Topic: ${topic}.`;
    }

    if (category) {
      prompt += ` Category: ${category}.`;
    }

    if (difficulty) {
      prompt += ` Difficulty: ${difficulty}.`;
    }

    if (docs) {
      prompt += `\n\nReference documents/context to use for generating questions:\n${docs}\n\nGenerate questions based on the provided context above.`;
    }

    prompt += `\n\nFormat your response as a JSON object with this exact structure:
{
  "questions": [
    {
      "text": "What is the question?",
      "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "correctIndex": 0,
      "category": "${category || 'general'}",
      "difficulty": "${difficulty || 'medium'}"
    }
  ]
}

Requirements:
- Each question must have EXACTLY 4 choices
- correctIndex must be 0, 1, 2, or 3 (the index of the correct answer)
- Questions should be clear and unambiguous
- Mix up the position of correct answers (don't always put them first)
- Make incorrect answers plausible but clearly wrong
- Keep questions and answers concise

Return ONLY the JSON object, no additional text.`;

    return prompt;
  }

  /**
   * Parse AI response and convert to Question objects
   */
  private parseAIResponse(content: string, request: AIQuestionRequest): Question[] {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const questionsData = parsed.questions || [];

      return questionsData.map((q: any) => {
        if (!Array.isArray(q.choices) || q.choices.length !== 4) {
          throw new Error('Each question must have exactly 4 choices');
        }

        if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
          throw new Error('correctIndex must be 0, 1, 2, or 3');
        }

        const question: Question = {
          id: generateQuestionId(),
          text: q.text,
          choices: q.choices,
          correctIndex: q.correctIndex,
          category: (q.category || request.category || 'general') as QuestionCategory,
          difficulty: (q.difficulty || request.difficulty || 'medium') as QuestionDifficulty,
          timeLimit: 30, // Default 30 seconds
          points: 1000 // Default base points
        };

        return question;
      });
    } catch (error) {
      console.error('Error parsing AI response:', error);
      console.error('Content:', content);
      throw new Error('Failed to parse AI-generated questions');
    }
  }

  /**
   * Detect which provider to use based on configuration
   */
  private detectProvider(): 'openai' | 'anthropic' | 'litellm' {
    if (this.defaultModel.startsWith('claude')) {
      return 'anthropic';
    } else if (this.defaultModel.startsWith('gpt')) {
      return 'openai';
    } else if (this.openai) {
      return 'openai';
    } else if (this.anthropic) {
      return 'anthropic';
    }
    return 'litellm';
  }

  /**
   * Ask AI to answer a trivia question (for lifeline feature)
   */
  async answerQuestion(question: string, choices: string[]): Promise<{ suggestedIndex: number; confidence: string }> {
    const prompt = `You are playing a trivia game. Answer the following multiple choice question.

Question: ${question}

Choices:
A: ${choices[0]}
B: ${choices[1]}
C: ${choices[2]}
D: ${choices[3]}

Respond with ONLY a JSON object in this exact format:
{"answer": "A", "confidence": "high"}

Where "answer" is the letter (A, B, C, or D) of your best guess, and "confidence" is "high", "medium", or "low".`;

    try {
      let content = '';

      if (this.litellm) {
        const completion = await this.litellm.chat.completions.create({
          model: this.defaultModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        });
        content = completion.choices[0]?.message?.content || '';
      } else if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        });
        content = completion.choices[0]?.message?.content || '';
      } else if (this.anthropic) {
        const message = await this.anthropic.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }]
        });
        const textContent = message.content[0];
        if (textContent.type === 'text') {
          content = textContent.text;
        }
      } else {
        throw new Error('No AI provider available');
      }

      // Parse the response
      const jsonMatch = content.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const letterToIndex: Record<string, number> = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
        const suggestedIndex = letterToIndex[parsed.answer?.toUpperCase()] ?? 0;
        return {
          suggestedIndex,
          confidence: parsed.confidence || 'medium'
        };
      }

      // Fallback: look for just the letter
      const letterMatch = content.match(/\b([ABCD])\b/i);
      if (letterMatch) {
        const letterToIndex: Record<string, number> = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
        return {
          suggestedIndex: letterToIndex[letterMatch[1].toUpperCase()] ?? 0,
          confidence: 'low'
        };
      }

      // Random fallback
      return { suggestedIndex: Math.floor(Math.random() * 4), confidence: 'low' };
    } catch (error) {
      console.error('Error asking AI:', error);
      // Return random answer on error
      return { suggestedIndex: Math.floor(Math.random() * 4), confidence: 'low' };
    }
  }

  /**
   * Check if AI is available
   */
  isAvailable(): boolean {
    return !!(this.litellm || this.openai || this.anthropic);
  }
}
