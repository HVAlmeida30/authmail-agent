import { json } from '@/lib/http';
export async function GET() { return json({ service: 'authmail-agent', status: 'up' }); }
