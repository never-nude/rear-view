import { works, type Work } from './catalog';
export { works };
export const collectionCount = works.length;
export const featuredWork = works[0];
export function v3WorkRoute(work: Work | string): string {
  return `/works/${typeof work === 'string' ? work : work.slug}/`;
}
export function neighborsFor(work: Work) {
  const index = works.findIndex(candidate => candidate.slug === work.slug);
  return { previous: works[(index + works.length - 1) % works.length], next: works[(index + 1) % works.length] };
}
