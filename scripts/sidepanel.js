import CONFIG from './config.js';

// Global variables
let pageContent = null;
let isFirstMessage = true;
let conversationHistory = [];

const FINANCIAL_SYSTEM_PROMPT = `You are an expert financial advisor and market analyst. Your role is to:
1. Analyze financial market data, trading information, and investment opportunities
2. Provide clear, actionable insights based on the webpage content
3. Help users understand market trends, risks, and potential opportunities
4. Offer balanced perspectives considering both potential gains and risks
5. Use technical analysis when relevant data is available
6. Consider market sentiment and news impact
7. Remind users about risk management principles

Remember to:
- Always emphasize the importance of due diligence
- Mention that this is analysis, not financial advice
- Encourage diversification and risk management
- Point out both opportunities and potential risks
- Use clear, non-technical language when possible`;

// Utility Functions
function convertMarkdownToHtml(text) {
    return text
        .replace(/### (.*?)\n/g, '<h3>$1</h3>')
        .replace(/## (.*?)\n/g, '<h2>$1</h2>')
        .replace(/# (.*?)\n/g, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/- (.*?)(\n|$)/g, '<li>$1</li>')
        .replace(/(<li>.*?<\/li>)\n*/g, '<ul>$1</ul>')
        .replace(/\d+\. (.*?)(\n|$)/g, '<li>$1</li>')
        .replace(/\n/g, '<br>');
}

function formatFinancialContent(content) {
    return `
    FINANCIAL CONTEXT:
    ----------------
    ${content}

    ANALYSIS REQUESTED:
    Please analyze this financial information considering:
    1. Market context and trends
    2. Key metrics and indicators
    3. Potential risks and opportunities
    4. Technical analysis points if applicable
    5. Related market factors
    `;
}

// Content Extraction
async function getPageContent() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            throw new Error('No active tab found');
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                function extractNumbers(text) {
                    return text.match(/[\d,]+\.?\d*/g) || [];
                }

                function findFinancialTerms(text) {
                    const terms = ['stock', 'price', 'market', 'trade', 'buy', 'sell', 'bull', 'bear', 'dividend', 'yield'];
                    return terms.filter(term => text.toLowerCase().includes(term));
                }

                return {
                    url: window.location.href,
                    title: document.title,
                    content: document.body.innerText,
                    financialData: {
                        numbers: extractNumbers(document.body.innerText),
                        terms: findFinancialTerms(document.body.innerText),
                        priceElements: Array.from(document.querySelectorAll('[data-symbol], .price, .quote'))
                            .map(el => el.textContent.trim()),
                        tableData: Array.from(document.querySelectorAll('table'))
                            .map(table => table.textContent.trim())
                    }
                };
            }
        });

        if (!results || !results[0]) {
            throw new Error('No content retrieved');
        }

        return results[0].result;
    } catch (error) {
        console.error('Error getting page content:', error);
        throw error;
    }
}

// Chat Functions
async function callOpenAI(message, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const endpoint = `${CONFIG.AZURE_OPENAI_ENDPOINT}/openai/deployments/${CONFIG.AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=${CONFIG.API_VERSION}`;
            
            console.log('Calling Azure OpenAI endpoint:', endpoint);
            
            const messages = [
                {
                    role: "system",
                    content: FINANCIAL_SYSTEM_PROMPT + "\nProvide detailed, comprehensive analysis when appropriate."
                },
                ...conversationHistory,
                {
                    role: "user",
                    content: message
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
                    max_tokens: 2000,
                    presence_penalty: 0,
                    frequency_penalty: 0,
                    top_p: 1
                })
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
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

function appendMessage(role, content) {
    const messagesContainer = document.querySelector('#chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    
    if (role === 'assistant') {
        messageDiv.innerHTML = convertMarkdownToHtml(content);
    } else {
        messageDiv.textContent = content;
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage(message) {
    if (!message) return;

    const messagesContainer = document.querySelector('#chat-messages');
    
    appendMessage('user', message);

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.textContent = 'Analyzing financial data...';
    messagesContainer.appendChild(loadingDiv);

    try {
        let context = message;

        if (isFirstMessage) {
            try {
                loadingDiv.textContent = 'Gathering webpage content...';
                const pageData = await getPageContent();
                pageContent = JSON.stringify(pageData, null, 2);
                context = formatFinancialContent(pageContent) + `\nUser question: ${message}`;
                
                const contentNotice = document.createElement('div');
                contentNotice.className = 'content-notice';
                contentNotice.textContent = 'Page content analyzed';
                messagesContainer.appendChild(contentNotice);
                setTimeout(() => contentNotice.remove(), 3000);
            } catch (error) {
                console.error('Error auto-grabbing content:', error);
            }
            isFirstMessage = false;
        }

        const response = await callOpenAI(context);
        messagesContainer.removeChild(loadingDiv);
        appendMessage('assistant', response);
        
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: response }
        );

    } catch (error) {
        console.error('Chat error:', error);
        if (loadingDiv && loadingDiv.parentNode) {
            messagesContainer.removeChild(loadingDiv);
        }
        appendMessage('assistant', `Error analyzing financial data: ${error.message}`);
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    const messagesContainer = document.querySelector('#chat-messages');
    const chatInput = document.querySelector('#chat-input');
    const sendButton = document.querySelector('#send-message');
    
    console.log('Elements found:', {
        messagesContainer: messagesContainer,
        chatInput: chatInput,
        sendButton: sendButton
    });

    if (chatInput && sendButton) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const message = chatInput.value.trim();
                if (message) {
                    sendMessage(message);
                    chatInput.value = '';
                }
            }
        });

        sendButton.addEventListener('click', () => {
            const message = chatInput.value.trim();
            if (message) {
                sendMessage(message);
                chatInput.value = '';
            }
        });
    } else {
        console.error('Could not find chat input or send button');
    }
});

// Add style for content notice
const style = document.createElement('style');
style.textContent = `
    .content-notice {
        background-color: #e3f2fd;
        color: #1976d2;
        padding: 8px;
        border-radius: 4px;
        font-size: 0.9em;
        margin: 8px 0;
        text-align: center;
        animation: fadeIn 0.3s ease-in-out;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in sidepanel:', request);
    if (request.action === "textSelected") {
        selectedText = request.text;
        console.log('Selected text updated:', selectedText);
    }
});

console.log('Sidepanel script loaded');