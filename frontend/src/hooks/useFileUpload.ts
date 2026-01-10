import { useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { uploadFile, type UploadResponse } from '../services/upload-api';

interface UseFileUploadOptions {
  onUpload?: (result: UploadResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for handling file uploads with a hidden file input.
 * Accepts any file type.
 */
export function useFileUpload(options: UseFileUploadOptions = {}) {
  const { onUpload, onError } = options;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadFile(file);
        onUpload?.(result);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      const err = error instanceof Error ? error : new Error('Upload failed');
      onError?.(err);
      if (!onError) {
        toast.error(err.message);
      }
    } finally {
      setIsUploading(false);
      // Reset input for re-uploading same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onUpload, onError]);

  const inputProps = {
    ref: fileInputRef,
    type: 'file' as const,
    multiple: true,
    onChange: handleFileSelect,
    className: 'hidden',
  };

  return {
    isUploading,
    triggerUpload,
    inputProps,
    fileInputRef,
  };
}

// Backwards compatibility alias
export const useImageUpload = useFileUpload;
export type UseImageUploadOptions = UseFileUploadOptions;
