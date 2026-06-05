import { useEffect, useState } from 'react';

export function useVoteConfirmation({ onConfirmSubmit, resetKey }) {
  const [pending, setPending] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setPending(null);
    setConfirmed(false);
  }, [resetKey]);

  const choose = (choice) => {
    if (!confirmed) setPending(choice);
  };

  const change = () => {
    if (!confirmed) setPending(null);
  };

  const confirm = () => {
    if (!pending || confirmed) return;
    onConfirmSubmit(pending);
    setConfirmed(true);
  };

  return { pending, confirmed, choose, change, confirm };
}
