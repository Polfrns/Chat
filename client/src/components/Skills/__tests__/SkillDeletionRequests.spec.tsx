import { fireEvent, render, screen } from '@testing-library/react';
import SkillDeletionRequests from '../SkillDeletionRequests';

const mockMutate = jest.fn();
const mockUseRequests = jest.fn();

jest.mock('~/data-provider', () => ({
  useSkillDeletionRequestsQuery: () => mockUseRequests(),
  useDecideSkillDeletionMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('@librechat/client', () => ({
  OGDialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const pending = {
  requestId: 'request-1',
  skillId: 'skill-1',
  name: 'weekly-report',
  description: 'Formats reports',
  requestedAt: 1,
};

describe('SkillDeletionRequests', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing without a pending request', () => {
    mockUseRequests.mockReturnValue({ data: { requests: [] } });
    const { container } = render(<SkillDeletionRequests />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the skill and sends the explicit decision', () => {
    mockUseRequests.mockReturnValue({ data: { requests: [pending] } });
    render(<SkillDeletionRequests />);
    expect(screen.getByText('weekly-report')).toBeInTheDocument();
    expect(screen.getByText('Formats reports')).toBeInTheDocument();

    fireEvent.click(screen.getByText('com_roko_skill_delete_keep'));
    expect(mockMutate).toHaveBeenLastCalledWith({ requestId: 'request-1', approve: false });

    fireEvent.click(screen.getByText('com_roko_skill_delete_confirm'));
    expect(mockMutate).toHaveBeenLastCalledWith({ requestId: 'request-1', approve: true });
  });
});
