import { toast } from 'sonner';
import { errorMessage } from '@/lib/error-messages';
import { feesApi } from '../api';

/** Fetches the receipt PDF (authenticated) and opens it in a new tab. */
export async function openReceipt(paymentId: string): Promise<void> {
  try {
    const blob = await feesApi.receipt(paymentId);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    toast.error(errorMessage(e));
  }
}
