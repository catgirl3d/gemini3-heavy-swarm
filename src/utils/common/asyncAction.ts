export type AsyncAction = () => Promise<unknown> | unknown;

export const runAsyncAction = (
  action: AsyncAction,
  onError: (error: unknown) => void
): void => {
  try {
    void Promise.resolve(action()).catch(onError);
  } catch (error) {
    onError(error);
  }
};
