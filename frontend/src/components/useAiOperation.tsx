import { useRef, useState } from "react";
import { api, type AiOptions } from "../api";

type State = "idle" | "running" | "cancelling" | "cancelled" | "failed" | "complete";
type Ticket = {id?:string; stop:boolean; cancelled:boolean; controller:AbortController};
export function useAiOperation() {
  const [state,setState]=useState<State>("idle");
  const [stopError,setStopError]=useState("");
  const current=useRef<Ticket | null>(null);
  function begin() {
    const ticket={stop:false,cancelled:false,controller:new AbortController()};
    current.current=ticket;setStopError("");setState("running");return ticket as Ticket;
  }
  async function cancel(ticket:Ticket) {
    if (!ticket.id) return;
    try {
      const result=await api.cancelJob(ticket.id);
      if (current.current!==ticket) return;
      if (result.state==="cancelled") {
        ticket.cancelled=true;ticket.controller.abort();setState("cancelled");
      } else if (result.state==="complete") setState("complete");
      else if (result.state==="failed") setState("failed");
    } catch {
      ticket.stop=false;setStopError("Не удалось подтвердить остановку. Повторите.");setState("running");
    }
  }
  async function stop() {
    const ticket=current.current;if (!ticket) return;
    ticket.stop=true;setState("cancelling");await cancel(ticket);
  }
  async function run<T>(call:(options:AiOptions)=>Promise<T>):Promise<T|null> {
    const ticket=begin();
    try {
      ticket.id=(await api.reserveAi()).job_id;
      if (ticket.stop) await cancel(ticket);
      if (ticket.cancelled) return null;
      const result=await call({operationId:ticket.id,signal:ticket.controller.signal});
      if (ticket.cancelled) return null;
      setState("complete");return result;
    } catch(error) {
      if (ticket.cancelled || (error as {code?:string}).code==="AI_CANCELLED") {
        setState("cancelled");return null;
      }
      setState("failed");throw error;
    }
  }
  async function startJob(call:()=>Promise<{job_id:string}>) {
    const ticket=begin();
    try {
      const result=await call();ticket.id=result.job_id;
      if(ticket.stop) await cancel(ticket);
      return result;
    } catch(error) {setState("failed");throw error;}
  }
  function track(id:string) {
    if(current.current?.id===id) return;
    const ticket=begin();ticket.id=id;
  }
  function settle(next:State) {setState(next);}
  return {state,stopError,stop,run,startJob,track,settle};
}

export function AiOperationStatus({operation}:{operation:ReturnType<typeof useAiOperation>}) {
  if(!["running","cancelling","cancelled"].includes(operation.state)) return null;
  return <div className="ai-operation-status row" role="status" aria-live="polite">
    <span>{operation.state==="cancelling"?"Останавливаем…":operation.state==="cancelled"?"Остановлено":"AI работает…"}</span>
    {operation.state==="running" && <button type="button" className="btn sm" onClick={()=>void operation.stop()}>Стоп</button>}
    {operation.stopError && <span role="alert">{operation.stopError}</span>}
  </div>;
}
