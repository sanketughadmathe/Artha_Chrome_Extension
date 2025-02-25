import CONFIG from './config.js';

// Add the formatting function directly
function convertMarkdownToHtml(text) {
    console.log('Converting markdown to HTML...');
    const converted = text
        // Convert headers
        .replace(/### (.*?)\n/g, '<h3>$1</h3>')
        .replace(/## (.*?)\n/g, '<h2>$1</h2>')
        .replace(/# (.*?)\n/g, '<h1>$1</h1>')
        // Convert bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Convert italics
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Convert bullet points
        .replace(/- (.*?)(\n|$)/g, '<li>$1</li>')
        // Wrap lists in ul
        .replace(/(<li>.*?<\/li>)\n*/g, '<ul>$1</ul>')
        // Convert numbered lists
        .replace(/\d+\. (.*?)(\n|$)/g, '<li>$1</li>')
        // Convert line breaks
        .replace(/\n/g, '<br>');
    
    console.log('Conversion complete:', converted);
    return converted;
}

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

class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }

    async waitForAvailability() {
        const now = Date.now();
        this.requests = this.requests.filter(time => time > now - this.timeWindow);
        
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const waitTime = oldestRequest + this.timeWindow - now;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.requests.push(now);
    }
}

// // Create rate limiter instance
// const rateLimiter = new RateLimiter(3, 1000); // 3 requests per second

let pageContent = null;
let isFirstMessage = true;
let conversationHistory = [];
let messagesContainer;
let selectedText = '';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    initializeTabs();
    initializeChat();
    initializeContentGrabber();

    // Get DOM elements with correct selectors
    messagesContainer = document.querySelector('#chat-messages'); // Update selector to match your HTML
    console.log('Messages container found:', messagesContainer);
    
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    
    console.log('Elements found:', {
        messagesContainer: messagesContainer,
        chatInput: chatInput,
        sendButton: sendButton
    });

    // Add event listeners only if elements exist
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                console.log('Enter key pressed');
                e.preventDefault();
                const message = chatInput.value.trim();
                if (message) {
                    console.log('Handling chat message from Enter key');
                    handleChat(message);
                    chatInput.value = '';
                }
            }
        });
        console.log('Chat input event listener added');
    }

    if (sendButton) {
        sendButton.addEventListener('click', () => {
            const message = chatInput.value.trim();
            if (message) {
                console.log('Handling chat message from button click');
                handleChat(message);
                chatInput.value = '';
            }
        });
        console.log('Send button event listener added');
    }
});

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

function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

function initializeChat() {
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message');

    sendButton.addEventListener('click', () => sendMessage());
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        appendMessage('user', message);
        chatInput.value = '';

        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.textContent = 'Analyzing financial data...';
        chatMessages.appendChild(loadingDiv);

        try {
            let context;
            if (isFirstMessage && pageContent) {
                context = formatFinancialContent(pageContent) + `\nUser question: ${message}`;
                isFirstMessage = false;
            } else {
                context = message;
            }

            const response = await callOpenAI(context);
            chatMessages.removeChild(loadingDiv);
            appendMessage('assistant', response);
            
            conversationHistory.push(
                { role: 'user', content: message },
                { role: 'assistant', content: response }
            );

        } catch (error) {
            console.error('Chat error:', error);
            chatMessages.removeChild(loadingDiv);
            appendMessage('assistant', `Error analyzing financial data: ${error.message}`);
        }
    }

    function appendMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}-message`;
        messageDiv.textContent = content;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function callOpenAI(message, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const endpoint = `${CONFIG.AZURE_OPENAI_ENDPOINT}/openai/deployments/${CONFIG.AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=${CONFIG.API_VERSION}`;
                
                console.log('Calling Azure OpenAI endpoint:', endpoint);
                
                const messages = [
                    {
                        role: "system",
                        content: FINANCIAL_SYSTEM_PROMPT
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
                        max_tokens: 800
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

    // Add a function to reset the conversation
    function resetConversation() {
        isFirstMessage = true;
        conversationHistory = [];
        chatMessages.innerHTML = '';
        appendMessage('assistant', 'Conversation has been reset. You can start a new conversation with the webpage content.');
    }

    // Add a reset button to the chat interface (optional)
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset Conversation';
    resetButton.className = 'reset-button';
    resetButton.addEventListener('click', resetConversation);
    document.querySelector('.chat-container').insertBefore(resetButton, chatMessages);
}

function initializeContentGrabber() {
    const statusDiv = document.getElementById('status');
    const contentDiv = document.getElementById('content');
    const grabButton = document.getElementById('grabContent');

    grabButton.addEventListener('click', async () => {
        console.log('Analyzing financial data...');
        statusDiv.textContent = 'Analyzing current page...';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

            statusDiv.textContent = 'Extracting financial data...';

            // Enhanced script to extract financial data
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    // Helper function to extract numerical data
                    function extractNumbers(text) {
                        return text.match(/[\d,]+\.?\d*/g) || [];
                    }

                    // Helper function to identify financial terms
                    function findFinancialTerms(text) {
                        const terms = ['stock', 'price', 'market', 'trade', 'buy', 'sell', 'bull', 'bear', 'dividend', 'yield'];
                        return terms.filter(term => text.toLowerCase().includes(term));
                    }

                    return {
                        url: window.location.href,
                        title: document.title,
                        content: document.body.innerText,
                        // Extract specific financial elements
                        financialData: {
                            numbers: extractNumbers(document.body.innerText),
                            terms: findFinancialTerms(document.body.innerText),
                            // Add specific selectors for common financial websites
                            priceElements: Array.from(document.querySelectorAll('[data-symbol], .price, .quote'))
                                .map(el => el.textContent.trim()),
                            tableData: Array.from(document.querySelectorAll('table'))
                                .map(table => table.textContent.trim())
                        }
                    };
                }
            });

            if (!results || !results[0]) {
                throw new Error('No financial data retrieved');
            }

            const pageData = results[0].result;
            pageContent = JSON.stringify(pageData, null, 2); // Store structured data

            // Display the analyzed content
            contentDiv.innerHTML = `
                <div class="content-section">
                    <h3>Financial Analysis</h3>
                    <p>Source: ${pageData.url}</p>
                    <p>Page Title: ${pageData.title}</p>
                    
                    <h4>Detected Financial Data:</h4>
                    <ul>
                        ${pageData.financialData.terms.map(term => 
                            `<li>Found term: ${term}</li>`
                        ).join('')}
                    </ul>
                    
                    <h4>Numerical Data:</h4>
                    <ul>
                        ${pageData.financialData.numbers.slice(0, 10).map(num => 
                            `<li>${num}</li>`
                        ).join('')}
                    </ul>
                </div>
            `;

            statusDiv.textContent = 'Financial data analysis complete!';
            isFirstMessage = true; // Reset conversation for new analysis
            conversationHistory = [];

        } catch (error) {
            console.error('Error analyzing financial data:', error);
            statusDiv.textContent = 'Error in financial analysis!';
            contentDiv.innerHTML = `
                <div class="error">
                    <p>Error: ${error.message}</p>
                    <p>Please try again or check if this page contains financial data.</p>
                </div>
            `;
        }
    });
}


async function handleChat(userMessage) {
    console.log('handleChat started with message:', userMessage);

    if (!messagesContainer) {
        console.error('Messages container not found!');
        return;
    }

    try {
        console.log('1. Displaying user message');
        // Display user message
        const userDiv = document.createElement('div');
        userDiv.className = 'user-message';
        userDiv.textContent = userMessage;
        messagesContainer.appendChild(userDiv);

        console.log('2. Adding loading indicator');
        // Show loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'ai-message loading';
        loadingDiv.textContent = 'AI is thinking...';
        messagesContainer.appendChild(loadingDiv);

        // Send message to background script with explicit error handling
        console.log('3. Preparing to send message to background');
        let response;
        try {
            response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: "sidebarChat",
                    prompt: userMessage,
                    context: selectedText || ''
                }, (result) => {
                    if (chrome.runtime.lastError) {
                        console.error('Chrome runtime error:', chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    console.log('4. Message response received:', result);
                    resolve(result);
                });
            });
        } catch (error) {
            console.error('5. Error sending message:', error);
            throw error;
        }

        console.log('6. Removing loading indicator');
        loadingDiv.remove();

        console.log('7. Processing response:', response);

        if (!response.success) {
            console.error('8a. Response indicates failure');
            throw new Error(response.error || 'Unknown error occurred');
        }

        if (response.formattedAnswer) {
            console.log('8b. Adding formatted response to DOM');
            const aiMessageDiv = document.createElement('div');
            aiMessageDiv.className = 'ai-message';
            aiMessageDiv.innerHTML = response.formattedAnswer;
            messagesContainer.appendChild(aiMessageDiv);
            
            console.log('9. Message added successfully');
        } else {
            console.error('8c. No formatted answer in response');
            throw new Error('No formatted answer in response');
        }

    } catch (error) {
        console.error('Error in handleChat:', error);
        if (loadingDiv) {
            loadingDiv.remove();
        }
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = `Error: ${error.message}`;
        messagesContainer.appendChild(errorDiv);
    }

    console.log('10. Scrolling to bottom');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add console log for when the script loads
console.log('Sidepanel script loaded');

// Listen for selected text from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in sidepanel:', request);
    if (request.action === "textSelected") {
        selectedText = request.text;
        console.log('Selected text updated:', selectedText);
    }
});