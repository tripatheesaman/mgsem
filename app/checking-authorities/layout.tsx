'use client';

import { ProtectedLayout } from '../components/ProtectedLayout';

export default function CheckingAuthoritiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}

