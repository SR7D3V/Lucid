import type { Metadata } from 'next';
import AuthShell from '@/components/AuthShell';
import ForgotPasswordForm from './ForgotPasswordForm';

export const metadata: Metadata = { title: 'Forgot Password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
