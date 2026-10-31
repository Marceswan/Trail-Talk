import { test, expect, register } from './fixtures';
import type { Comment } from '../lib/types';

// Exercise the larger touch targets on an actual touch-capable browser context.
test.use({ hasTouch: true });

test('comment votes persist, switch direction, aggregate across visitors, and reject invalid input', async ({ request, playwright }) => {
  const initial: { comments: Comment[] } = await (await request.get('/api/community?post=1')).json();
  const comment = initial.comments[0];
  const vote = async (value: number) => {
    const response = await request.post('/api/community', { data: { action: 'commentVote', commentId: comment.id, value } });
    expect(response.ok()).toBeTruthy();
    const result: { comments: Comment[] } = await response.json();
    return result.comments.find(c => c.id === comment.id)!;
  };
  expect(await vote(1)).toMatchObject({ score: comment.score + 1, vote: 1 });
  expect(await vote(1)).toMatchObject({ score: comment.score + 1, vote: 1 });
  expect(await vote(-1)).toMatchObject({ score: comment.score - 1, vote: -1 });
  expect(await vote(0)).toMatchObject({ score: comment.score, vote: 0 });
  await vote(1);
  const persisted: { comments: Comment[] } = await (await request.get('/api/community?post=1')).json();
  expect(persisted.comments.find(c => c.id === comment.id)).toMatchObject({ score: comment.score + 1, vote: 1 });

  const other = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3100' });
  try {
    await register(other);
    const otherView: { comments: Comment[] } = await (await other.get('/api/community?post=1')).json();
    expect(otherView.comments.find(c => c.id === comment.id)).toMatchObject({ score: comment.score + 1, vote: 0 });
    await other.post('/api/community', { data: { action: 'commentVote', commentId: comment.id, value: -1 } });
    const combined: { comments: Comment[] } = await (await request.get('/api/community?post=1')).json();
    expect(combined.comments.find(c => c.id === comment.id)).toMatchObject({ score: comment.score, vote: 1 });
    await other.post('/api/community', { data: { action: 'commentVote', commentId: comment.id, value: 0 } });
  } finally { await other.dispose(); }
  await vote(0);

  for (const value of [2, -2, '1', null, 0.5]) {
    expect((await request.post('/api/community', { data: { action: 'commentVote', commentId: comment.id, value } })).status()).toBe(400);
  }
  for (const commentId of [9999999, '1', 1.5, null]) {
    expect((await request.post('/api/community', { data: { action: 'commentVote', commentId, value: 1 } })).status()).toBe(404);
  }
  expect((await request.post('/api/community', { headers: { Origin: 'https://untrusted.example' }, data: { action: 'commentVote', commentId: comment.id, value: 1 } })).status()).toBe(403);
  const final: { comments: Comment[] } = await (await request.get('/api/community?post=1')).json();
  expect(final.comments.find(c => c.id === comment.id)).toMatchObject({ score: comment.score, vote: 0 });
});

test('comment voting works on mobile, survives reload, and preserves the score on failure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/posts/2');
  const comment = page.locator('.comment').first();
  const upvote = comment.getByRole('button', { name: /^Upvote comment/ });
  const downvote = comment.getByRole('button', { name: /^Downvote comment/ });
  const score = comment.locator('.comment-score');
  await expect(score).toHaveText('0');
  await upvote.click();
  await expect(upvote).toHaveAttribute('aria-pressed', 'true');
  await expect(score).toHaveText('1');
  await page.reload();
  await expect(upvote).toHaveAttribute('aria-pressed', 'true');
  await expect(score).toHaveText('1');
  await downvote.click();
  await expect(downvote).toHaveAttribute('aria-pressed', 'true');
  await expect(upvote).toHaveAttribute('aria-pressed', 'false');
  await expect(score).toHaveText('-1');
  await downvote.click();
  await expect(downvote).toHaveAttribute('aria-pressed', 'false');
  await expect(score).toHaveText('0');

  await page.route('**/api/community', async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'commentVote') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Could not save your vote. Please try again.' }) });
    } else await route.continue();
  });
  await upvote.click();
  await expect(page.getByRole('status')).toContainText('Could not save your vote.');
  await expect(score).toHaveText('0');
  await expect(upvote).toHaveAttribute('aria-pressed', 'false');
  await expect(upvote).toBeEnabled();
  await page.unroute('**/api/community');
  await upvote.click();
  await expect(score).toHaveText('1');
  await upvote.click();
  await expect(score).toHaveText('0');
  expect((await upvote.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
