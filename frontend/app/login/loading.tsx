import Image from 'next/image';

function LoadingPulse() {
  return <div className="animate-pulse bg-dark-secondary rounded h-4" />;
}

export default function LoadingLogin() {
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
          <div className="space-y-6">
            <div>
              <div className="w-32 mb-1">
                <LoadingPulse />
              </div>
              <div className="mt-1">
                <div className="h-10 rounded-md bg-dark-primary animate-pulse" />
              </div>
            </div>

            <div>
              <div className="w-24 mb-1">
                <LoadingPulse />
              </div>
              <div className="mt-1">
                <div className="h-10 rounded-md bg-dark-primary animate-pulse" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-4 w-4 rounded bg-dark-primary animate-pulse" />
                <div className="ml-2 w-24">
                  <LoadingPulse />
                </div>
              </div>

              <div className="w-32">
                <LoadingPulse />
              </div>
            </div>

            <div>
              <div className="h-10 rounded-md bg-accent-primary/50 animate-pulse" />
            </div>
          </div>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dark-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <div className="px-2 bg-dark-secondary">
                  <div className="w-48">
                    <LoadingPulse />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
