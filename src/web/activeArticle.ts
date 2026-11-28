export function activeArticle(articles: ArrayLike<HTMLElement>, top: number): HTMLElement | undefined {
  let low = 0;
  let high = articles.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (articles[middle].getBoundingClientRect().top <= top) low = middle + 1;
    else high = middle;
  }
  return articles[Math.max(0, low - 1)];
}
