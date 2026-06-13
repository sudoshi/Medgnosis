import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.js';

describe('Tabs', () => {
  it('renders tab triggers', () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="labs">Labs</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">overview body</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Labs' })).toBeInTheDocument();
  });
});
