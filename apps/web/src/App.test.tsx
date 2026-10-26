import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('render không lỗi', () => {
    render(<App />);
    expect(screen.getByText('Language Center')).toBeInTheDocument();
  });
});
