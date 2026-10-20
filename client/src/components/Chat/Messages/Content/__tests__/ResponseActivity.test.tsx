import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ResponseActivity from '../ResponseActivity';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  scheduleMessageContentLayoutReconcile: jest.fn(() => jest.fn()),
}));

describe('response activity disclosure', () => {
  it('shows live steps, collapses on completion and lets the user reopen them', () => {
    const { rerender } = render(<ResponseActivity isSubmitting>Reading files</ResponseActivity>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Reading files')).toBeVisible();
    rerender(<ResponseActivity isSubmitting={false}>Read files</ResponseActivity>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Read files')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Read files')).toBeVisible();
  });

  it('respects a live toggle until generation ends and keeps new events in the same block', () => {
    const { rerender } = render(<ResponseActivity isSubmitting>First step</ResponseActivity>);
    fireEvent.click(screen.getByRole('button'));
    rerender(<ResponseActivity isSubmitting>Second step</ResponseActivity>);
    expect(screen.getByText('Second step')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button'));
    rerender(<ResponseActivity isSubmitting={false}>Finished</ResponseActivity>);
    expect(screen.getByText('Finished')).not.toBeVisible();
  });

  it('loads saved responses collapsed without removing their activity', () => {
    render(<ResponseActivity isSubmitting={false}>Saved activity</ResponseActivity>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-controls');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(screen.getByText('Saved activity')).toBeVisible();
  });
});
