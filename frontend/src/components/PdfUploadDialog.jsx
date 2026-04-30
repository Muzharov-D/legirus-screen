import { useRef, useState } from 'react';
import { uploadPdf } from '../services/api';
import './PdfUploadDialog.css';

export default function PdfUploadDialog({ onClose, onSuccess }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function handlePick(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    setError(null);
    setResult(null);
  }

  async function handleSubmit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await uploadPdf(file);
      setResult(res);
      onSuccess?.(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-dialog__backdrop" onClick={onClose}>
      <div className="upload-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="upload-dialog__head">
          <span>Загрузка PDF Sportvisor</span>
          <button className="upload-dialog__x" onClick={onClose}>✕</button>
        </div>
        <div className="upload-dialog__body">
          <p className="upload-dialog__hint">
            Принимается PDF-отчёт Sportvisor (35 страниц). После загрузки парсер автоматически извлечёт данные матча, командные дашборды и индивидуальные карты.
          </p>

          <button
            className="upload-dialog__pick"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {file ? file.name : 'Выбрать PDF…'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: 'none' }}
            onChange={handlePick}
          />

          {error && <div className="upload-dialog__error">Ошибка: {error}</div>}
          {result && (
            <div className="upload-dialog__success">
              Матч {result.matchId} обработан. Перезагрузите страницу, чтобы увидеть его в списке.
            </div>
          )}

          <div className="upload-dialog__actions">
            <button className="upload-dialog__cancel" onClick={onClose}>Закрыть</button>
            <button
              className="upload-dialog__submit"
              onClick={handleSubmit}
              disabled={!file || busy}
            >
              {busy ? 'Парсинг…' : 'Загрузить и разобрать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
