import React from 'react';
// @ts-ignore
import { FintocWidgetView } from '@fintoc/fintoc-react-native';

interface FintocWidgetProps {
  onLinkSuccess: (publicToken: string) => void;
  onExit?: () => void;
}

export const FintocWidget: React.FC<FintocWidgetProps> = ({ onLinkSuccess, onExit }) => {
  const publicKey = process.env.EXPO_PUBLIC_FINTOC_PUBLIC_KEY || 'tu_public_key_de_fintoc';

  const options = {
    public_key: publicKey,
    holder_type: 'individual',
  };

  const handleSuccess = (link: any) => {
    // The link object returned by FintocWidgetView might contain the token directly.
    // Wait, the docs say it passes the same object as the web widget.
    const token = link?.id || link;
    if (token) {
      onLinkSuccess(token);
    }
  };

  const handleExit = () => {
    if (onExit) onExit();
  };

  return (
    <FintocWidgetView
      options={options}
      onSuccess={handleSuccess}
      onExit={handleExit}
    />
  );
};
