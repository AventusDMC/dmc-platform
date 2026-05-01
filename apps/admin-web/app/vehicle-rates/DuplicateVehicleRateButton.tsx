'use client';

type DuplicateVehicleRateButtonProps = {
  onDuplicate: () => void;
};

export function DuplicateVehicleRateButton({ onDuplicate }: DuplicateVehicleRateButtonProps) {
  return (
    <button type="button" className="compact-button" onClick={onDuplicate}>
      Duplicate
    </button>
  );
}
