import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'AuthMail Agent | Caixa de verificação',
  description: 'Crie aliases de e-mail temporários ou permanentes e gerencie suas mensagens com segurança.',
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
