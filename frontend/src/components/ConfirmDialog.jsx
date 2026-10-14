import { useEffect, useRef } from 'react'

/* eslint-disable react/prop-types */
export default function ConfirmDialog({ confirmation, onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!confirmation) return undefined
    const dialog = dialogRef.current
    const trigger = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [confirmation])

  if (!confirmation) return null

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      onCancel={onClose}
    >
      <h2 id="confirm-title">{confirmation.title}</h2>
      <p id="confirm-description">{confirmation.description}</p>
      <div className="confirm-dialog__actions">
        <button className="secondary-button" type="button" onClick={onClose}>취소</button>
        <button
          className={`primary-button${confirmation.danger ? ' danger-button' : ''}`}
          type="button"
          onClick={() => {
            onClose()
            confirmation.onConfirm()
          }}
        >
          {confirmation.label}
        </button>
      </div>
    </dialog>
  )
}
