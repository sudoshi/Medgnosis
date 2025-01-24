import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  const maxWidthClass = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-7xl',
  }[size];

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-dark-primary/60 backdrop-blur-sm transition-all" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-8 scale-95"
              enterTo="opacity-100 translate-y-0 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 scale-100"
              leaveTo="opacity-0 translate-y-8 scale-95"
            >
              <Dialog.Panel
                className={`relative transform overflow-hidden rounded-xl bg-dark-primary/95 backdrop-blur-sm px-4 pb-4 pt-5 text-left transition-all sm:my-8 sm:w-full ${maxWidthClass} sm:p-6 border-2 border-accent-primary/30 modal-animate`}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-accent-primary/5 to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 pr-4 pt-4">
                  <button
                    type="button"
                    className="rounded-full p-1 bg-dark-secondary/50 text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-secondary/80 focus:outline-none transition-colors"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="modal-content relative">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent-primary/10 via-transparent to-accent-primary/5 pointer-events-none" />
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold leading-6 text-dark-text-primary border-b border-dark-secondary/30 pb-4 mb-4 bg-gradient-to-r from-accent-primary/20 to-transparent"
                  >
                    {title}
                  </Dialog.Title>
                  <div className="mt-2 relative">{children}</div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
