import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Command, CommandEmpty, CommandInput, CommandList } from './command.js';

describe('Command', () => {
  it('renders a search input', () => {
    render(
      <Command>
        <CommandInput placeholder="Type a command" />
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>
        </CommandList>
      </Command>,
    );
    expect(screen.getByPlaceholderText('Type a command')).toBeInTheDocument();
  });
});
