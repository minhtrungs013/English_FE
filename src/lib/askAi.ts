/** Opens the chat assistant and asks about a word (from a search that found nothing in the library). */
export const ASK_AI_EVENT = 'wordbook:ask-ai';
export const askAiQuestion = (word: string) => '“' + word.trim() + '” nghĩa là gì? Cho mình ví dụ khi đi làm.';
export function askAi(word: string): void {
  window.dispatchEvent(new CustomEvent<string>(ASK_AI_EVENT, { detail: askAiQuestion(word) }));
}
