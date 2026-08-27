// Pure, framework-free logic for the staging direct Agent-create form.
// Kept React-free so it can be unit-tested directly and shared by the form.

export type DirectAgentFormValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

// Client-side validation: required fields + password confirmation match. The
// server route re-validates the same rules before invoking the backend, so this
// is defense-in-depth, not the sole gate. Never surfaces the password value.
export function validateDirectAgentForm(values: DirectAgentFormValues): { ok: boolean; error: string } {
  if (!values.name.trim()) return { ok: false, error: 'Display name is required.' };
  if (!values.email.trim()) return { ok: false, error: 'Email is required.' };
  if (!values.password.trim()) return { ok: false, error: 'Password is required.' };
  if (values.password !== values.confirmPassword) return { ok: false, error: 'Passwords do not match.' };
  return { ok: true, error: '' };
}

// The request body the client sends to the same-origin route: ONLY the
// owner-entered fields. role, company, and active are deliberately absent — the
// server route forces role=agent + active=true and derives the company from the
// authenticated Admin. The password lives only in this request body.
export function buildDirectAgentRequestBody(values: DirectAgentFormValues): {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
} {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    password: values.password,
    confirmPassword: values.confirmPassword,
  };
}
