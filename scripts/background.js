import CONFIG from './config.js';

const FINANCIAL_SYSTEM_PROMPT = `You are an expert financial advisor and market analyst. Your role is to:
1. Analyze financial market data, trading information, and investment opportunities
2. Provide clear, actionable insights based on the webpage content
3. Help users understand market trends, risks, and potential opportunities
4. Offer balanced perspectives considering both potential gains and risks
5. Use technical analysis when relevant data is available
6. Consider market sentiment and news impact
7. Remind users about risk management principles`;

// Add token limit for Quick Ask
const QUICK_ASK_TOKEN_LIMIT = 150; // Adjust this value as needed

chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Listen for messages from the tooltip
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    if (request.action === "analyzeText") {
        // Open the side panel with the selected text
        chrome.sidePanel.open().then(() => {
            chrome.runtime.sendMessage({
                action: "textSelected",
                text: request.text
            });
        });
    } else if (request.action === "chat") {
        // Quick Ask chat (with token limit)
        // Add a specific prompt for brief responses
        const briefPrompt = `Please provide a brief and concise response in 2-3 sentences: ${request.prompt}`;
        callOpenAI(briefPrompt, request.context, 3, true) // Added boolean for isQuickAsk
            .then(response => {
                sendResponse({ answer: response });
            })
            .catch(error => {
                console.error('Chat error:', error);
                sendResponse({ error: error.message });
            });
        return true;
    } else if (request.action === "sidebarChat") {
        console.log('Processing sidebarChat request');
        // Sidepanel chat - no token limit
        callOpenAI(request.prompt, request.context)
            .then(response => {
                console.log('OpenAI response in background:', response);
                sendResponse({
                    success: true,
                    answer: response // This should be the markdown text from OpenAI
                });
            })
            .catch(error => {
                console.error('Chat error in background:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        return true;
    }
});

async function callOpenAI(message, context = '', retries = 3, isQuickAsk = false) {
    console.log('Calling OpenAI with:', { message, context });
    for (let i = 0; i < retries; i++) {
        try {
            const endpoint = `${CONFIG.AZURE_OPENAI_ENDPOINT}/openai/deployments/${CONFIG.AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=${CONFIG.API_VERSION}`;
            
            console.log('Calling Azure OpenAI endpoint:', endpoint);
            
            const messages = [
                {
                    role: "system",
                    content: isQuickAsk 
                    ? FINANCIAL_SYSTEM_PROMPT + "\nProvide very brief, concise responses."
                    : FINANCIAL_SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: `Context: ${context}\n\nQuestion: ${message}`
                }
            ];

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': CONFIG.AZURE_OPENAI_KEY
                },
                body: JSON.stringify({
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: isQuickAsk ? QUICK_ASK_TOKEN_LIMIT : 800, // Different token limits
                    // Add for more concise responses in Quick Ask
                    top_p: isQuickAsk ? 0.5 : 1,
                    presence_penalty: isQuickAsk ? 0.6 : 0
                })
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Azure OpenAI error response:', errorData);
                throw new Error(errorData.error?.message || 'Failed to get response from Azure OpenAI');
            }

            const data = await response.json();
            console.log('Azure OpenAI response:', data);
            
            return data.choices[0].message.content;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i === retries - 1) throw error;
            
            if (error.message.includes('rate limit')) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
            }
        }
    }
}