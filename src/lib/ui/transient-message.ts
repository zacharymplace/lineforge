export type TransientMessageState = {
  message: string | null;
  token: number;
};

export function createTransientMessageState(
  message: string,
  currentState?: TransientMessageState,
): TransientMessageState {
  return {
    message,
    token: (currentState?.token ?? 0) + 1,
  };
}

export function clearTransientMessageState(
  state: TransientMessageState,
  token: number,
): TransientMessageState {
  return state.token === token ? { message: null, token } : state;
}

