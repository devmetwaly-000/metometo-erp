"use client"

// This hook is inspired by react-hot-toast & shadcn/ui
import * as React from "react"

// Import types from the toast component
import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 1
const DEFAULT_FALLBACK_DELAY = 2500;

let defaultToastDuration: number = (() => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('app_toast_duration');
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed < 100 ? Math.round(parsed * 1000) : Math.round(parsed);
        }
      }
    } catch {}
  }
  return DEFAULT_FALLBACK_DELAY;
})();

export const setDefaultToastDuration = (durationMs: number) => {
  if (typeof durationMs === 'number' && !isNaN(durationMs) && durationMs > 0) {
    defaultToastDuration = durationMs;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('app_toast_duration', String(durationMs));
      } catch {}
    }
  }
};

export const getDefaultToastDuration = () => defaultToastDuration;

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  duration?: number
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const dismissTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const removeTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const scheduleDismiss = (toastId: string, duration?: number) => {
  if (dismissTimeouts.has(toastId)) return;
  const effectiveDuration = (typeof duration === 'number' && duration > 0)
    ? duration
    : defaultToastDuration;

  const timeout = setTimeout(() => {
    dismissTimeouts.delete(toastId);
    dispatch({ type: "DISMISS_TOAST", toastId });
  }, effectiveDuration);

  dismissTimeouts.set(toastId, timeout);
};

const scheduleRemove = (toastId: string) => {
  if (removeTimeouts.has(toastId)) return;

  if (dismissTimeouts.has(toastId)) {
    clearTimeout(dismissTimeouts.get(toastId)!);
    dismissTimeouts.delete(toastId);
  }

  // Allow smooth CSS exit animation (250ms) before unmounting from DOM
  const timeout = setTimeout(() => {
    removeTimeouts.delete(toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, 250);

  removeTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      if (toastId) {
        scheduleRemove(toastId);
      } else {
        state.toasts.forEach((toast) => {
          scheduleRemove(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id"> & {
    duration?: number;
}

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (updatedProps: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...updatedProps, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })
  
  scheduleDismiss(id, props.duration);

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
