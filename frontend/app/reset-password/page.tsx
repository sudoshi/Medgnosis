import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to send reset email');
      }

      setSuccess('Password reset instructions have been sent to your email');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-dark flex flex-col justify-center">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <Image
            src="/images/acumenus-logo.png"
            alt="Acumenus Logo"
            width={200}
            height={50}
            className="mx-auto mb-8"
          />
        </div>

        <div className="bg-dark-secondary py-8 px-6 shadow-glow rounded-lg sm:px-10 animate-fade-in">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-dark-text-primary">
              Reset Password
            </h2>
            <p className="mt-2 text-sm text-dark-text-secondary">
              Enter your email address and we&apos;ll send you instructions to reset your password.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-dark-text-primary"
              >
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-dark-border rounded-md shadow-sm bg-dark-primary text-dark-text-primary placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-colors"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {error && (
              <div className="text-accent-error text-sm text-center animate-fade-in">
                {error}
              </div>
            )}

            {success && (
              <div className="text-accent-success text-sm text-center animate-fade-in">
                {success}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent-primary hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-primary transition-colors ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? 'Sending...' : 'Send Reset Instructions'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="text-sm text-dark-text-secondary hover:text-dark-text-primary transition-colors"
              >
                Back to Login
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dark-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-dark-secondary text-dark-text-secondary">
                  Population Health Platform
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
