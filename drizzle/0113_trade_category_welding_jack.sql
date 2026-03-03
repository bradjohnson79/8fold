-- Add WELDING and JACK_OF_ALL_TRADES to TradeCategory enum.
-- Additive only. No drop, no recreate, no reorder.

ALTER TYPE public."TradeCategory" ADD VALUE IF NOT EXISTS 'WELDING';
ALTER TYPE public."TradeCategory" ADD VALUE IF NOT EXISTS 'JACK_OF_ALL_TRADES';
