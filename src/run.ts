import { IExecutor } from './Executor';
import ITask from './Task';


export default async function run(executor: IExecutor, queue: Iterable<ITask>, maxThreads = 0) {
    maxThreads = Math.max(0, maxThreads);
    /**
     * Код надо писать сюда
     * Тут что-то вызываем в правильном порядке executor.executeTask для тасков из очереди queue
     */
    const lockedTargets: Set<number> = new Set<number>();
    const tasks: ITask[] = [];
    const executionMap: Map<ITask, Promise<any>> = new Map();
    const executionArray: Array<Promise<any>> = [];
    type FinishTaskProps = {task: ITask, removeFromTask: boolean};

    async function executeTask(task: ITask, removeFromTask = false) {
        await executor.executeTask(task);
        return {task, removeFromTask};
    }

    function runTask(task: ITask, removeFromTasks = false) {
        lockedTargets.add(task.targetId);

        const promise: Promise<ITask> = executeTask(task, removeFromTasks).then(finishTask);

        executionMap.set(task, promise);
        executionArray.push(promise);
    }

    function finishTask(props: FinishTaskProps) {
        const finishedPromise: Promise<ITask> | undefined = executionMap.get(props.task);

        if (finishedPromise) {
            const promiseIndex = executionArray.indexOf(finishedPromise);

            if (promiseIndex !== -1) {
                executionArray.splice(promiseIndex, 1);
                executionMap.delete(props.task);

                lockedTargets.delete(props.task.targetId);
            }

            if (props.removeFromTask) {
                tasks.splice(tasks.indexOf(props.task), 1);
            }
        }
        return props.task;
    }

    async function shouldWaitForExecution(): Promise<boolean> {
        return !!executionArray.length;

    }

    while (true) {

        for (const task of queue) {

            if (lockedTargets.has(task.targetId)) {
                tasks.push(task);
            } else {
                if (!tasks.find(t => t.targetId === task.targetId)) {
                    runTask(task);
                }

                else {
                    const t = tasks.find(t => t.targetId === task.targetId);
                    if (t) {
                        runTask(t, true);
                        tasks.push(task);
                    }
                }


                if (maxThreads && executionArray.length >= maxThreads) {
                    await Promise.race(executionArray);
                }
            }
        }

        if (tasks.length) {

            const canRunThread = !maxThreads || executionArray.length < maxThreads;

            if (canRunThread) {
                const task = tasks.find(task => !lockedTargets.has(task.targetId));

                if (task) {
                    runTask(task, true);
                }
                else {
                    const wait = await shouldWaitForExecution();
                    if (wait) {
                        await Promise.race(executionArray);
                        continue;
                    } else {
                        break;
                    }
                }
            } else {
                const wait = await shouldWaitForExecution();
                if (wait) {
                    await Promise.race(executionArray);
                }
                else {
                    break;
                }
            }

        } else {
            const wait = await shouldWaitForExecution();
            if (wait) {
                await Promise.race(executionArray);
            }
            else {
                break;
            }
        }
    }

    if (executionArray.length) {
        await Promise.all(executionArray);
    }


    console.log('------- run finished ------');
    return;

}
