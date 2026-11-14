import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getRandomGame } from '@/lib/content';

/**
 * "Juego al azar": picks one published game and redirects to its sheet.
 *
 * It is a route handler, not a page, so the random pick happens on every
 * request and never gets cached.
 */
export async function GET() {
  await connection();
  const game = await getRandomGame();
  redirect(game ? `/juegos/${encodeURIComponent(game.slug)}` : '/juegos');
}
