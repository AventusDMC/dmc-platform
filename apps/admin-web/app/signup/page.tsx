import Link from 'next/link';
import { SignupForm } from './SignupForm';

export default function SignupPage() {
  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="workspace-shell">
          <div className="workspace-subheader">
            <p className="eyebrow">Onboarding</p>
            <h1>Create your company</h1>
            <p>Start a new company workspace and become its first admin.</p>
          </div>
          <SignupForm />
          <p className="form-helper">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
