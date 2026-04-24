import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/core/button';

describe('Button', () => {
  it('uses the visible label as the default accessibility label', () => {
    render(<Button label="Download offline region" disabled onPress={jest.fn()} />);

    const button = screen.getByRole('button', {
      name: 'Download offline region',
    });

    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('passes through accessibility hints and press events', () => {
    const onPress = jest.fn();

    render(
      <Button
        label="Continue"
        accessibilityHint="Moves to the farm setup step."
        onPress={onPress}
      />,
    );

    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button.props.accessibilityHint).toBe('Moves to the farm setup step.');

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
