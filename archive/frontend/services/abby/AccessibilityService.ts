export class AccessibilityService {
  private static instance: AccessibilityService;
  private readonly ARIA_ROLES = {
    DIALOG: 'dialog',
    BUTTON: 'button',
    TEXTBOX: 'textbox',
    STATUS: 'status',
    ALERT: 'alert',
    LOG: 'log',
  } as const;

  private constructor() {}

  static getInstance(): AccessibilityService {
    if (!AccessibilityService.instance) {
      AccessibilityService.instance = new AccessibilityService();
    }
    return AccessibilityService.instance;
  }

  setupAccessibility(element: HTMLElement, role: string, label: string) {
    element.setAttribute('role', role);
    element.setAttribute('aria-label', label);

    // Add focus outline styles
    element.style.outline = 'none';
    element.addEventListener('focus', () => {
      element.style.outline = '2px solid var(--accent-primary)';
    });
    element.addEventListener('blur', () => {
      element.style.outline = 'none';
    });
  }

  setupDialog(dialog: HTMLElement, title: string) {
    dialog.setAttribute('role', this.ARIA_ROLES.DIALOG);
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.setAttribute('aria-modal', 'true');

    const titleElement = dialog.querySelector('h1,h2,h3,h4,h5,h6');
    if (titleElement) {
      titleElement.id = 'dialog-title';
      titleElement.textContent = title;
    }
  }

  setupButton(button: HTMLButtonElement, label: string, description?: string) {
    button.setAttribute('role', this.ARIA_ROLES.BUTTON);
    button.setAttribute('aria-label', label);
    if (description) {
      button.setAttribute('aria-description', description);
    }

    // Ensure button is keyboard accessible
    if (!button.hasAttribute('tabindex')) {
      button.setAttribute('tabindex', '0');
    }

    // Add keyboard event listener
    button.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        button.click();
      }
    });
  }

  setupTextInput(input: HTMLInputElement, label: string) {
    const id = `input-${crypto.randomUUID()}`;
    input.id = id;
    input.setAttribute('role', this.ARIA_ROLES.TEXTBOX);
    
    // Create and setup label
    const labelElement = document.createElement('label');
    labelElement.htmlFor = id;
    labelElement.textContent = label;
    input.parentElement?.insertBefore(labelElement, input);

    // Add aria-invalid when there's an error
    const setInvalid = (isInvalid: boolean, errorMessage?: string) => {
      input.setAttribute('aria-invalid', isInvalid.toString());
      if (errorMessage) {
        input.setAttribute('aria-errormessage', errorMessage);
      } else {
        input.removeAttribute('aria-errormessage');
      }
    };

    return { setInvalid };
  }

  setupStatusMessage(element: HTMLElement, message: string, isAlert = false) {
    element.setAttribute('role', isAlert ? this.ARIA_ROLES.ALERT : this.ARIA_ROLES.STATUS);
    element.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
    element.textContent = message;
  }

  setupMessageLog(container: HTMLElement) {
    container.setAttribute('role', this.ARIA_ROLES.LOG);
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-relevant', 'additions');
  }

  announceMessage(message: string, isAlert = false) {
    const announcer = document.createElement('div');
    announcer.className = 'sr-only';
    announcer.setAttribute('role', isAlert ? this.ARIA_ROLES.ALERT : this.ARIA_ROLES.STATUS);
    announcer.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
    announcer.textContent = message;

    document.body.appendChild(announcer);
    setTimeout(() => announcer.remove(), 3000);
  }

  setupKeyboardNavigation(container: HTMLElement, selector: string) {
    const elements = container.querySelectorAll<HTMLElement>(selector);
    elements.forEach((element, index) => {
      element.setAttribute('tabindex', '0');
      element.addEventListener('keydown', (event: KeyboardEvent) => {
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            event.preventDefault();
            const nextIndex = (index + 1) % elements.length;
            (elements[nextIndex] as HTMLElement).focus();
            break;
          case 'ArrowLeft':
          case 'ArrowUp':
            event.preventDefault();
            const prevIndex = (index - 1 + elements.length) % elements.length;
            (elements[prevIndex] as HTMLElement).focus();
            break;
        }
      });
    });
  }
}

export const accessibilityService = AccessibilityService.getInstance();
