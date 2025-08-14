const express = require('express');
const OpenAI = require('openai');
const axios = require('axios');
const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to get player injury status from ESPN
async function getPlayerInjuryStatus(playerName) {
  try {
    // Use ESPN's search API for targeted player news
    const searchQuery = playerName.toLowerCase().replace(/\s+/g, '');
    const response = await axios.get('https://site.web.api.espn.com/apis/search/v2', {
      params: {
        query: `${searchQuery} injury`,
        limit: 10,
        type: 'article'
      },
      timeout: 5000
    });
    
    // Fix: Access nested structure correctly
    const articles = response.data.results?.[0]?.contents || [];
    console.log(`Found ${articles.length} articles for ${playerName}`);
    
    const relevantNews = articles.filter(article => {
      const headline = article.displayName?.toLowerCase() || '';
      return headline.includes('injury') ||
             headline.includes('hurt') ||
             headline.includes('out') ||
             headline.includes('questionable') ||
             headline.includes('doubtful');
    });
    
    if (relevantNews.length > 0) {
      return {
        player: playerName,
        news: relevantNews.slice(0, 3).map(article => ({
          headline: article.displayName,
          description: article.description || 'No description available',
          published: article.published || 'Recent',
          url: article.link?.web
        })),
        found: true
      };
    }
    
    // If no injury-specific news, return general player news
    if (articles.length > 0) {
      return {
        player: playerName,
        news: articles.slice(0, 3).map(article => ({
          headline: article.displayName,
          description: article.description || 'No description available',
          published: article.published || 'Recent',
          url: article.link?.web
        })),
        message: `No specific injury news found, but here's recent news about ${playerName}`,
        found: true
      };
    }
    
    return {
      player: playerName,
      message: `No recent news found for ${playerName}`,
      found: false
    };
  } catch (error) {
    return {
      player: playerName,
      error: `Failed to fetch injury status: ${error.message}`,
      found: false
    };
  }
}

// Function to get current NFL context (teams, recent trades, current season info)
async function getCurrentNFLContext() {
  try {
    // Get current NFL teams and recent news
    const response = await axios.get('https://site.web.api.espn.com/apis/search/v2', {
      params: {
        query: '2024 NFL trades roster moves',
        limit: 20,
        type: 'article'
      },
      timeout: 5000
    });
    
    const articles = response.data.results?.[0]?.contents || [];
    const recentMoves = articles.filter(article => {
      const headline = article.displayName?.toLowerCase() || '';
      return headline.includes('trade') || 
             headline.includes('sign') || 
             headline.includes('release') || 
             headline.includes('waiver') ||
             headline.includes('injured reserve') ||
             headline.includes('contract');
    }).slice(0, 10);
    
    return {
      currentSeason: '2024 NFL Season',
      recentMoves: recentMoves.map(article => ({
        headline: article.displayName,
        url: article.link?.web
      })),
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    return {
      currentSeason: '2024 NFL Season',
      error: `Failed to fetch current NFL context: ${error.message}`,
      recentMoves: []
    };
  }
}

// Function to search fantasy news using ESPN's search API
async function searchFantasyNews(query) {
  try {
    // Use ESPN's search API for targeted fantasy news
    const response = await axios.get('https://site.web.api.espn.com/apis/search/v2', {
      params: {
        query: query,
        limit: 15,
        type: 'article'
      },
      timeout: 5000
    });
    
    // Fix: Access nested structure correctly
    const articles = response.data.results?.[0]?.contents || [];
    console.log(`Found ${articles.length} articles for query: ${query}`);
    
    // Filter for fantasy football related content
    const relevantNews = articles.filter(article => {
      const text = (article.displayName + ' ' + (article.description || '')).toLowerCase();
      const fantasyKeywords = ['fantasy', 'draft', 'waiver', 'start', 'sit', 'rankings', 'projections', 'injury', 'trade'];
      return fantasyKeywords.some(keyword => text.includes(keyword)) || 
             text.includes('nfl') || text.includes('football');
    });
    
    return {
      query,
      results: relevantNews.slice(0, 5).map(article => ({
        headline: article.displayName,
        description: article.description || 'No description available',
        published: article.published || 'Recent',
        url: article.link?.web
      })),
      found: relevantNews.length > 0
    };
  } catch (error) {
    return {
      query,
      error: `Failed to search fantasy news: ${error.message}`,
      found: false
    };
  }
}

router.post('/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    let systemPrompt = `You are a fantasy football draft assistant. You help users make optimal draft decisions during their fantasy football draft.

IMPORTANT: Your knowledge cutoff is over a year old (early 2024), so you may not know about recent trades, signings, injuries, or current NFL roster changes. Always use the available tools to get current information when discussing players or making recommendations.

ACCURACY REQUIREMENTS:
1. ALWAYS fact-check player team assignments using tools before making recommendations
2. If uncertain about current player status, explicitly state "Let me check the latest info..." and use tools
3. When tools return no results, state "I couldn't find current information about [player], so I recommend checking ESPN or another source"
4. Never guess or use potentially outdated information about:
   - Player injuries or health status
   - Current team assignments
   - Suspensions or legal issues
   - Recent performance stats

You have access to the following tools:
1. **Player Injury Status**: Get the latest injury status and news for NFL players.
2. **Fantasy News Search**: Search for recent fantasy football news and updates.
3. **Current NFL Context**: Get recent trades, signings, and roster moves to understand the current state of the league.

INFORMATION PRIORITY:
1. If user has uploaded CSV/screenshot rankings: use those EXCLUSIVELY for rankings
2. If no CSV/screenshot: use general fantasy knowledge but clearly state "Based on consensus rankings..."
3. Always mention when using uploaded vs consensus data

Use tools for:
- Current injury status (your training data is outdated)
- Recent trades or roster moves
- Team depth charts
- Breaking news

Be brutally honest with the user - It is better to hurt feelings than to give bad advice. When CSV data exists, strictly follow their rankings. When not, provide best consensus advice while suggesting they upload their custom rankings.

Context about the user's league:
${context ? JSON.stringify(context, null, 2) : 'No league context provided yet'}`;

    if (context?.espnData) {
      systemPrompt += `

LIVE ESPN DRAFT DATA:
- Draft Status: ${context.espnData.draftStatus?.inProgress ? 'IN PROGRESS' : context.espnData.draftStatus?.completed ? 'COMPLETED' : 'NOT STARTED'}
- Current Pick #: ${context.espnData.currentPick || 'Unknown'}
- Players Already Drafted: ${context.espnData.draftedPlayers?.length || 0}

Your Current Team:
${context.espnData.myTeam?.map(player => `- ${player.name} (${player.position})`).join('\n') || 'No players drafted yet'}

All Drafted Players:
${context.espnData.draftedPlayers?.map(pick => 
  `Pick #${pick.pickNumber}: ${pick.player.name} (${pick.player.position}) to ${pick.teamName}`
).join('\n') || 'No players drafted yet'}

IMPORTANT: Use this live ESPN data to provide accurate recommendations about who is still available and what your team needs.`;
    }

    // Add conversation context with analyzed data
    if (context?.conversationContext?.screenshots) {
      const screenshots = Object.values(context.conversationContext.screenshots);
      
      if (screenshots.length > 0) {
        systemPrompt += `

PREVIOUSLY ANALYZED SCREENSHOTS:
${screenshots.map((screenshot, index) => 
  `${index + 1}. ${screenshot.name} (${screenshot.position}) - ${screenshot.timestamp}:
${screenshot.analysis}${screenshot.tierData ? '\nTier Data: ' + JSON.stringify(screenshot.tierData.tiers || {}, null, 2) : ''}`
).join('\n\n')}

IMPORTANT: Reference this previously analyzed data when answering questions. For example, if the user asks about QB rankings, refer to the specific tier data and projected points from the analysis above.`;
      }
    }

    if (context?.tierData && Object.keys(context.tierData).length > 0) {
      systemPrompt += `

Available Player Tier Data:
${Object.entries(context.tierData).map(([pos, data]) => `${pos}: Analyzed on ${data.uploadedAt}`).join('\n')}

Use this tier data to provide more accurate player recommendations based on the user's uploaded rankings.`;
    }

    systemPrompt += `
<SYSTEM>
Provide concise, actionable advice for draft decisions. Consider:
- Player rankings and projections (especially from uploaded tier charts) 
- Players already drafted (from ESPN data if available)
- Your current team composition
- Positional scarcity
- Team needs
- Draft position and strategy
- Bye weeks
- Injury concerns

Be conversational but focused on helping them win their league.
Assume the user is knowledgeable about fantasy football but may need help with specific decisions, your strength is in providing tailored advice based on the current draft state and available data.
</SYSTEM>
<FORMAT>
Respond in the following format:
 - **Draft Advice**: Provide clear, actionable recommendations based on the current draft state.
 - Respond in plain text, no markdown formatting needed.
</FORMAT>
`;

    // Build conversation history
    let conversationMessages = [{ role: "system", content: systemPrompt }];
    
    // Add recent conversation history (last 8 messages to keep context manageable)
    if (context?.conversationHistory && context.conversationHistory.length > 1) {
      const recentHistory = context.conversationHistory.slice(-8);
      conversationMessages.push(...recentHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })));
    }
    
    // Add current message
    conversationMessages.push({ role: "user", content: message });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationMessages,
      max_tokens: 1000, // Reduced from 1500 to save tokens
      temperature: 0.7,
      tools: [
        {
          type: "function",
          function: {
            name: "get_player_injury_status",
            description: "Get current injury status and news for NFL players",
            parameters: {
              type: "object",
              properties: {
                player_name: {
                  type: "string",
                  description: "The NFL player's name"
                }
              },
              required: ["player_name"]
            }
          }
        },
        {
          type: "function", 
          function: {
            name: "search_fantasy_news",
            description: "Search for recent fantasy football news and updates",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for fantasy football news"
                }
              },
              required: ["query"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "get_current_nfl_context",
            description: "Get current NFL season context including recent trades, signings, and roster moves to understand the current state of the league",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          }
        }
      ],
      tool_choice: "auto"
    });

    // Handle function calls with loop for multiple rounds
    let currentMessages = [...conversationMessages];
    let currentCompletion = completion;
    let maxIterations = 5; // Prevent infinite loops
    let iterations = 0;
    
    while (currentCompletion.choices[0].message.tool_calls && iterations < maxIterations) {
      iterations++;
      console.log(`Function call iteration ${iterations}`);
      
      const message = currentCompletion.choices[0].message;
      currentMessages.push(message);
      
      // Process all tool calls in this round
      const functionResults = [];
      
      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`Calling function: ${functionName} with args:`, functionArgs);
        
        let result;
        try {
          switch (functionName) {
            case 'get_player_injury_status':
              result = await getPlayerInjuryStatus(functionArgs.player_name);
              break;
            case 'search_fantasy_news':
              result = await searchFantasyNews(functionArgs.query);
              break;
            case 'get_current_nfl_context':
              result = await getCurrentNFLContext();
              break;
            default:
              result = `Unknown function: ${functionName}`;
          }
        } catch (error) {
          console.error(`Error in function ${functionName}:`, error);
          result = { error: `Error calling ${functionName}: ${error.message}` };
        }
        
        functionResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: JSON.stringify(result)
        });
      }
      
      // Add function results to conversation
      currentMessages.push(...functionResults);
      
      // Make next API call
      currentCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: currentMessages,
        max_tokens: 1500,
        temperature: 0.7,
        tools: [
          {
            type: "function",
            function: {
              name: "get_player_injury_status",
              description: "Get current injury status and news for NFL players",
              parameters: {
                type: "object",
                properties: {
                  player_name: {
                    type: "string",
                    description: "The NFL player's name"
                  }
                },
                required: ["player_name"]
              }
            }
          },
          {
            type: "function", 
            function: {
              name: "search_fantasy_news",
              description: "Search for recent fantasy football news and updates",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search query for fantasy football news"
                  }
                },
                required: ["query"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "get_current_nfl_context",
              description: "Get current NFL season context including recent trades, signings, and roster moves to understand the current state of the league",
              parameters: {
                type: "object",
                properties: {},
                required: []
              }
            }
          }
        ],
        tool_choice: "auto"
      });
    }
    
    if (iterations >= maxIterations) {
      console.warn('Max function call iterations reached');
    }
    
    res.json({ 
      response: currentCompletion.choices[0].message.content 
    });
  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

router.post('/analyze-screenshot', async (req, res) => {
  try {
    const { imageBase64, question, position, isRankingChart, conversationContext } = req.body;
    
    let prompt;
    if (isRankingChart) {
      prompt = `Analyze this ${position} fantasy football tier chart. Extract the following information:
      1. Players in each tier (Tier 1, Tier 2, etc.)
      2. Projected fantasy points if visible
      3. Any notable insights about player rankings
      
      Format your response with BOTH:
      1. A readable analysis section with insights and recommendations
      2. A structured data section at the end with clear tier breakdowns
      
      Example format:
      ### Readable Analysis
      **Tier 1:** - **Players**: Josh Allen, Lamar Jackson - **Projected Points**: 362 for both
      
      ### Structured Data
      \`\`\`json
      {
        "Tier 1": {
          "Players": ["Josh Allen", "Lamar Jackson"],
          "Projected Points": [362, 362]
        }
      }
      \`\`\`
      
      ${question || ''}`;
    } else {
      prompt = `Analyze this fantasy football draft board screenshot. ${question || 'What players are available and what should I draft next?'}`;
    }
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
    });

    const response = completion.choices[0].message.content;
    
    // If this is a ranking chart, try to extract structured tier data
    let tierData = null;
    if (isRankingChart) {
      try {
        // Try to extract JSON from the response
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        let parsedTiers = null;
        
        if (jsonMatch) {
          try {
            parsedTiers = JSON.parse(jsonMatch[1]);
          } catch (parseError) {
            console.log('Could not parse JSON from response');
          }
        }
        
        tierData = {
          position: position,
          timestamp: new Date(),
          analysis: response,
          tiers: parsedTiers,
          rawResponse: response
        };
      } catch (e) {
        console.log('Could not extract structured tier data');
        tierData = {
          position: position,
          timestamp: new Date(),
          analysis: response
        };
      }
    }

    res.json({ 
      response,
      tierData,
      position
    });
  } catch (error) {
    console.error('OpenAI Vision API error:', error);
    res.status(500).json({ error: 'Failed to analyze screenshot' });
  }
});

module.exports = router;
