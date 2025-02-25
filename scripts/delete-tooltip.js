const tooltip = document.createElement('div');
tooltip.className = 'hover-tooltip';
document.body.appendChild(tooltip);

let hoverTimeout;
const defaultIncludeTags = ['P', 'A', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV'];

// Financial terms and patterns
const financialPatterns = {
    prices: /\$\d+\.?\d*|\d+\.?\d*\s*(USD|EUR|GBP|JPY|INR)/i,
    percentages: /[-+]?\d+\.?\d*\s*%/,
    numbers: /\d+,?\d*\.?\d*/,
    financialTerms: [
        'stock', 'price', 'market', 'trade', 'buy', 'sell',
        'bull', 'bear', 'dividend', 'yield', 'investment',
        'portfolio', 'equity', 'fund', 'asset', 'bond',
        'crypto', 'bitcoin', 'ethereum', 'forex'
    ]
};

let userConfig = {
    showAnalysis: true,
    showMetrics: true,
    showSentiment: true,
    includeTags: defaultIncludeTags
};

chrome.storage.sync.get(['tooltipConfig'], (result) => {
    userConfig = {...userConfig, ...result.tooltipConfig};
});

document.addEventListener('mouseover', (e) => {
    const element = e.target;
    
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
        if (shouldShowTooltip(element)) {
            const analysis = analyzeFinancialContent(element);
            if (analysis) {
                tooltip.innerHTML = buildTooltipContent(analysis);
                positionTooltip(e);
                tooltip.classList.add('visible');
            }
        }
    }, 300); // Increased delay for better UX
});

document.addEventListener('mouseout', () => {
    clearTimeout(hoverTimeout);
    tooltip.classList.remove('visible');
});

function shouldShowTooltip(element) {
    if (!userConfig.includeTags.includes(element.tagName)) return false;
    const text = element.textContent.trim();
    
    // Check if content contains financial information
    return (
        financialPatterns.prices.test(text) ||
        financialPatterns.percentages.test(text) ||
        financialPatterns.financialTerms.some(term => 
            text.toLowerCase().includes(term.toLowerCase())
        )
    );
}

function analyzeFinancialContent(element) {
    const text = element.textContent.trim();
    const analysis = {
        metrics: [],
        terms: [],
        sentiment: null,
        suggestion: null
    };

    // Extract prices
    const prices = text.match(financialPatterns.prices);
    if (prices) {
        analysis.metrics.push(`Price: ${prices[0]}`);
    }

    // Extract percentages
    const percentages = text.match(financialPatterns.percentages);
    if (percentages) {
        analysis.metrics.push(`Change: ${percentages[0]}`);
    }

    // Identify financial terms
    financialPatterns.financialTerms.forEach(term => {
        if (text.toLowerCase().includes(term.toLowerCase())) {
            analysis.terms.push(term);
        }
    });

    // Basic sentiment analysis
    if (text.match(/increase|higher|gain|up|positive|bull/i)) {
        analysis.sentiment = 'Positive';
    } else if (text.match(/decrease|lower|loss|down|negative|bear/i)) {
        analysis.sentiment = 'Negative';
    } else {
        analysis.sentiment = 'Neutral';
    }

    // Generate suggestion
    if (analysis.terms.length > 0) {
        analysis.suggestion = generateSuggestion(analysis);
    }

    return analysis.metrics.length > 0 || analysis.terms.length > 0 ? analysis : null;
}

function generateSuggestion(analysis) {
    if (analysis.terms.includes('stock')) {
        return "💡 Consider checking company fundamentals and market trends";
    } else if (analysis.terms.includes('crypto')) {
        return "💡 High volatility asset - ensure proper risk management";
    } else if (analysis.terms.includes('dividend')) {
        return "💡 Review dividend history and payout ratio";
    }
    return "💡 Click for detailed financial analysis";
}

function buildTooltipContent(analysis) {
    const content = [];
    
    if (analysis.metrics.length > 0) {
        content.push(`<div class="metrics">${analysis.metrics.join(' | ')}</div>`);
    }

    if (analysis.terms.length > 0) {
        content.push(`<div class="terms">Related: ${analysis.terms.join(', ')}</div>`);
    }

    if (analysis.sentiment) {
        const sentimentColor = {
            'Positive': '#4caf50',
            'Negative': '#f44336',
            'Neutral': '#9e9e9e'
        }[analysis.sentiment];
        content.push(`<div class="sentiment" style="color: ${sentimentColor}">Sentiment: ${analysis.sentiment}</div>`);
    }

    if (analysis.suggestion) {
        content.push(`<div class="suggestion">${analysis.suggestion}</div>`);
    }

    return content.join('<br>');
}

function positionTooltip(e) {
    const offset = 15;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let left = e.pageX + offset;
    let top = e.pageY + offset;

    if (left + tooltip.offsetWidth > windowWidth) {
        left = e.pageX - tooltip.offsetWidth - offset;
    }
    if (top + tooltip.offsetHeight > windowHeight) {
        top = e.pageY - tooltip.offsetHeight - offset;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}