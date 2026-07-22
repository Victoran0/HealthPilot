'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateId } from '@/lib/generate_id';

export default function AssessmentPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    const id = generateId();
    router.replace(`/assessment/${id}`);
  }, [router]);

  return null;
}