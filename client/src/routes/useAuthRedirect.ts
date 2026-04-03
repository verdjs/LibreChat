import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildLoginRedirectUrl } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';

export default function useAuthRedirect() {
  const { user, roles, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (startupConfig?.guestMode) {
      return;
    }

    const timeout = setTimeout(() => {
      if (isAuthenticated) {
        return;
      }

      navigate(buildLoginRedirectUrl(location.pathname, location.search, location.hash), {
        replace: true,
      });
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate, location, startupConfig?.guestMode]);

  return {
    user,
    roles,
    isAuthenticated,
  };
}
