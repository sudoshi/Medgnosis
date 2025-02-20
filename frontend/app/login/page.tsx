'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login, loading } = useAuth();
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const remember = formData.get('remember-me') === 'on';
      await login({ email, password, remember });
      router.push('/dashboard'); // Redirect to Dashboard after successful login
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-dark flex flex-col justify-center">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <Image
            src="/images/acumenus-logo.png"
            alt="Acumenus Logo"
            width={350} // Increase/decrease this value
            height={75} // Adjust proportionally with the width
            className="mx-auto mb-8"
          />
        </div>

        <div className="bg-dark-secondary py-8 px-6 shadow-glow rounded-lg sm:px-10 animate-fade-in">
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

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-dark-text-primary"
              >
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-dark-border rounded-md shadow-sm bg-dark-primary text-dark-text-primary placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-colors"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-dark-border bg-dark-primary text-accent-primary focus:ring-accent-primary"
                />
                <label
                  htmlFor="remember-me"
                  className="ml-2 block text-sm text-dark-text-secondary"
                >
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link
                  href="/reset-password"
                  className="font-medium text-accent-primary hover:text-accent-primary/80 transition-colors"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            {error && (
              <div className="text-accent-error text-sm text-center animate-fade-in bg-accent-error/10 p-2 rounded">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent-primary hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-primary transition-colors ${
                  loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? (
                  <div className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Signing in...
                  </div>
                ) : (
                  'Sign in'
                )}
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
