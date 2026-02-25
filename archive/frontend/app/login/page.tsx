'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login, loading } = useAuth();
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      console.log('Login - Using API URL:', API_URL);
      
      const remember = formData.get('remember-me') === 'on';
      await login({ email, password, remember });
      router.push('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-dark flex flex-col justify-center items-center relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-accent-primary/5 blur-3xl"></div>
        <div className="absolute -bottom-[30%] -left-[10%] w-[70%] h-[70%] rounded-full bg-accent-primary/5 blur-3xl"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="text-center">
          <Image
            src="/images/acumenus-logo.png"
            alt="Acumenus Logo"
            width={350}
            height={75}
            className="mx-auto mb-8 animate-fade-in"
            priority
          />
        </div>

        <div className={`panel-analytics relative p-0 overflow-hidden animate-fade-in ${mounted ? 'modal-content' : ''}`}>
          <div className="absolute inset-0 bg-gradient-dark opacity-90"></div>
          
          {/* Login form container */}
          <div className="relative py-8 px-6 sm:px-10 z-10">
            <h2 className="text-xl font-semibold text-center mb-6 text-dark-text-primary">Welcome Back</h2>
            <p className="text-dark-text-secondary text-sm text-center mb-8">
              Sign in to access your Population Health Management platform
            </p>
            
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-dark-text-primary"
                >
                  Email address
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none block w-full px-4 py-3 border border-dark-border rounded-lg shadow-sm bg-dark-primary/60 backdrop-blur-sm text-dark-text-primary placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all duration-200"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-dark-text-primary"
                  >
                    Password
                  </label>
                  <div className="text-sm">
                    <Link
                      href="/reset-password"
                      className="font-medium text-accent-primary hover:text-accent-primary/80 transition-colors"
                    >
                      Forgot?
                    </Link>
                  </div>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="appearance-none block w-full px-4 py-3 border border-dark-border rounded-lg shadow-sm bg-dark-primary/60 backdrop-blur-sm text-dark-text-primary placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all duration-200"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 rounded border-dark-border bg-dark-primary/60 text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
                  />
                  <label
                    htmlFor="remember-me"
                    className="ml-2 block text-sm text-dark-text-secondary"
                  >
                    Remember me
                  </label>
                </div>
              </div>

              {error && (
                <div className="text-accent-error text-sm animate-fade-in bg-accent-error/10 p-3 rounded-lg border border-accent-error/20 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-accent-primary hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-primary transition-all duration-200 ${
                    loading ? 'opacity-70 cursor-not-allowed' : ''
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

            <div className="mt-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-dark-border/30" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 py-1 rounded-full bg-dark-secondary/60 backdrop-blur-sm text-dark-text-secondary">
                    Population Health Platform
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
