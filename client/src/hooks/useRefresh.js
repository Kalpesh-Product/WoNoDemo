import { api } from "../utils/axios";
import useAuth from "./useAuth";
import { useCallback } from "react";

export default function useRefresh() {
  const { setAuth } = useAuth();
  const refresh = useCallback(async () => {
    try {
      const response = await api.get("/api/auth/refresh", {
        withCredentials: true,
      });
      setAuth((prevState) => {
        return {
          ...prevState,
          accessToken: response.data.accessToken,
          user: response.data.user,
        };
      });
      return response.data;
    } catch (error) {
      setAuth((prevState) => {
        return {
          ...prevState,
          accessToken: "",
          user: null,
        };
      });
    }
  }, [setAuth]);
  return refresh;
}
