import React, { useState, useEffect } from 'react';
import { Product, ProductionBatch } from '../../types';
import { BatchFifoService } from '../../services/batchFifoService';
import { db, getActiveDb } from '../../db/db';
import { formatINR, roundCurrency } from '../../utils/math';
import { X, AlertTriangle, Trash2, CheckCircle2, Clock } from 'lucide-react';

interface BatchSpoilageModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  onSuccess?: () => void;
}

export const BatchSpoilageModal: React.FC<BatchSpoilageModalProps> = ({
  isOpen,
  onClose,
  product,
  onSuccess,
}) => {
  if (!isOpen) return null;

  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadBatches = async () => {
    try {
      setIsLoading(true);
      const activeDb = getActiveDb();
      const list = await activeDb.production_batches
        .where('product_id')
        .equals(product.id)
        .reverse()
        .sortBy('produced_at');
      setBatches(list);
    } catch (e) {
      console.warn('Failed to load batches', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, [product.id]);

  const handleSpoilBatch = async (batch: ProductionBatch) => {
    if (!window.confirm(`Mark ${batch.remaining_qty} ${batch.unit_type} of batch ${batch.batch_code} as spoiled write-off? This will deduct inventory and log an operational expense loss.`)) {
      return;
    }

    try {
      const res = await BatchFifoService.logBatchSpoilage({
        batchId: batch.id,
        reason: 'Operator shelf-life expiry write-off',
        loggedBy: 'Store Operator',
      });

      setActionFeedback(
        `Batch ${batch.batch_code} marked as spoiled. Written off ${res.spoiledQty} ${batch.unit_type} (Loss: ${formatINR(res.lossAmount)}).`
      );
      await loadBatches();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      alert(err?.message || 'Failed to log spoilage');
    }
  };

  const nowMs = Date.now();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        data-testid="batch-spoilage-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>📦 Production Batches &amp; Shelf-Life</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {product.name} {product.marathi_name ? `(${product.marathi_name})` : ''} | Current Total Stock: {product.current_stock} {product.unit_type}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {actionFeedback && (
            <div
              data-testid="spoilage-feedback-banner"
              className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionFeedback}</span>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-xs text-slate-400">Loading batch details...</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No production batches recorded yet for this item. Fresh batches created via "+ Fresh Batch Made" will appear here with FIFO tracking.
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => {
                const expiresMs = new Date(batch.expires_at).getTime();
                const diffMs = expiresMs - nowMs;
                const hoursLeft = Math.round(diffMs / (60 * 60 * 1000));
                const isExpired = diffMs <= 0;
                const isNearExpiry = !isExpired && diffMs <= 24 * 60 * 60 * 1000;

                return (
                  <div
                    key={batch.id}
                    data-testid={`batch-card-${batch.batch_code}`}
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                          {batch.batch_code}
                        </span>
                        {batch.status === 'SPOILED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            SPOILED
                          </span>
                        ) : batch.status === 'EXHAUSTED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            EXHAUSTED
                          </span>
                        ) : isExpired ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse">
                            EXPIRED
                          </span>
                        ) : isNearExpiry ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                            EXPIRES IN {hoursLeft}h
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            FRESH ({hoursLeft}h left)
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Made: {new Date(batch.produced_at).toLocaleDateString()}</span>
                        <span>Shelf Life: {batch.shelf_life_days} days</span>
                        <span>Cost: ₹{batch.unit_production_cost}/{batch.unit_type}</span>
                        <span>
                          Remaining: <strong className="text-slate-800 dark:text-slate-200">{batch.remaining_qty}</strong> / {batch.initial_qty} {batch.unit_type}
                        </span>
                      </div>
                    </div>

                    {batch.status === 'ACTIVE' && batch.remaining_qty > 0 && (
                      <button
                        type="button"
                        data-testid={`spoil-btn-${batch.batch_code}`}
                        onClick={() => handleSpoilBatch(batch)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition self-start sm:self-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Log Spoilage Loss</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

