export function convertMarkdownToHtml(text) {
    return text
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
} 