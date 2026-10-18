import { NextResponse } from 'next/server';
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status, headers: { 'Cache-Control': 'no-store, private' }
  });
}
export function failure(message: string, status = 400) { return json({ error: message }, status); }
