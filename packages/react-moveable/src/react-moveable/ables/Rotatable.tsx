import React from "react";
import { getRad, throttle, prefix, triggerEvent } from "../utils";
import { IObject, hasClass } from "@daybrush/utils";
import MoveableManager from "../MoveableManager";
import { RotatableProps, OnRotateGroup, OnRotateGroupEnd } from "../types";
import MoveableGroup from "../MoveableGroup";
import { triggerChildAble, setCustomEvent, getCustomEvent } from "../groupUtils";
import Draggable from "./Draggable";
import { minus, rotate, sum } from "../matrix";

function setRotateStartInfo(
    datas: IObject<any>, clientX: number, clientY: number, origin: number[], rotationPos: number[]) {
    datas.startAbsoluteOrigin = [
        clientX - rotationPos[0] + origin[0],
        clientY - rotationPos[1] + origin[1],
    ];
    datas.prevDeg = getRad(datas.startAbsoluteOrigin, [clientX, clientY]) / Math.PI * 180;
    datas.startDeg = datas.prevDeg;
    datas.loop = 0;
}
function getDeg(
    datas: IObject<any>,
    deg: number,
    direction: number,
    throttleRotate: number,
) {
    const {
        prevDeg,
        startDeg,
        loop: prevLoop,
    } = datas;
    deg = throttle(deg, throttleRotate);
    if (prevDeg > deg && prevDeg > 270 && deg < 90) {
        // 360 => 0
        ++datas.loop;
    } else if (prevDeg < deg && prevDeg < 90 && deg > 270) {
        // 0 => 360
        --datas.loop;
    }
    const absolutePrevDeg = prevLoop * 360 + prevDeg;
    const absoluteDeg = datas.loop * 360 + deg;

    const delta = direction * (absoluteDeg - absolutePrevDeg);
    const dist = direction * (absoluteDeg - startDeg);

    datas.prevDeg = deg;

    return [delta, dist];
}
function getRotateInfo(
    datas: IObject<any>,
    direction: number,
    clientX: number, clientY: number,
    throttleRotate: number,
) {
    return getDeg(
        datas,
        getRad(datas.startAbsoluteOrigin, [clientX, clientY]) / Math.PI * 180,
        direction,
        throttleRotate,
    );
}
function dragControlCondition(target: HTMLElement | SVGElement) {
    return hasClass(target, prefix("rotation"));
}

export default {
    name: "rotatable",
    canPinch: true,

    render(moveable: MoveableManager<RotatableProps>) {
        if (!moveable.props.rotatable) {
            return null;
        }

        const { pos1, pos2, rotationRad } = moveable.state;

        return (
            <div className={prefix("line rotation-line")} style={{
                // tslint:disable-next-line: max-line-length
                transform: `translate(${(pos1[0] + pos2[0]) / 2}px, ${(pos1[1] + pos2[1]) / 2}px) translateY(-40px) rotate(${rotationRad}rad)`,
            }}>
                <div className={prefix("control", "rotation")}></div>
            </div>
        );
    },
    dragControlCondition,
    dragControlStart(
        moveable: MoveableManager<RotatableProps>,
        { datas, clientX, clientY, parentRotate, parentFlag, pinchFlag }: any) {
        const {
            target, left, top, origin, beforeOrigin,
            rotationPos, direction, beforeDirection, targetTransform,
        } = moveable.state;

        if (!target) {
            return false;
        }

        datas.transform = targetTransform;
        datas.left = left;
        datas.top = top;

        if (pinchFlag || parentFlag) {
            datas.beforeInfo = { prevDeg: parentRotate, startDeg: parentRotate, loop: 0 };
            datas.afterInfo = { prevDeg: parentRotate, startDeg: parentRotate, loop: 0 };
        } else {
            datas.afterInfo = {};
            datas.beforeInfo = {};
            setRotateStartInfo(datas.afterInfo, clientX, clientY, origin, rotationPos);
            setRotateStartInfo(datas.beforeInfo, clientX, clientY, beforeOrigin, rotationPos);
        }

        datas.direction = direction;
        datas.beforeDirection = beforeDirection;
        datas.datas = {};

        const result = triggerEvent(moveable, "onRotateStart", {
            datas: datas.datas,
            target,
            clientX,
            clientY,
        });
        datas.isRotate = result !== false;
        return datas.isRotate;
    },
    dragControl(
        moveable: MoveableManager<RotatableProps>,
        { datas, clientX, clientY, parentRotate, parentFlag, pinchFlag }: any,
    ) {
        const {
            direction,
            beforeDirection,
            beforeInfo,
            afterInfo,
            isRotate,
        } = datas;

        if (!isRotate) {
            return;
        }
        const {
            throttleRotate = 0,
            parentMoveable,
        } = moveable.props;

        let delta: number;
        let dist: number;
        let beforeDelta: number;
        let beforeDist: number;

        if (pinchFlag || parentFlag) {
            [delta, dist] = getDeg(afterInfo, parentRotate, direction, throttleRotate);
            [beforeDelta, beforeDist] = getDeg(beforeInfo, parentRotate, direction, throttleRotate);
        } else {
            [delta, dist] = getRotateInfo(afterInfo, direction, clientX, clientY, throttleRotate);
            [beforeDelta, beforeDist] = getRotateInfo(
                beforeInfo, beforeDirection, clientX, clientY, throttleRotate);
        }

        if (!delta && !beforeDelta && !parentMoveable) {
            return;
        }
        const params = {
            target: moveable.props.target!,
            datas: datas.datas,
            delta,
            dist,
            clientX,
            clientY,
            beforeDist,
            beforeDelta,
            transform: `${datas.transform} rotate(${dist}deg)`,
            isPinch: !!pinchFlag,
        };
        triggerEvent(moveable, "onRotate", params);

        return params;
    },
    dragControlEnd(
        moveable: MoveableManager<RotatableProps>, { datas, isDrag, clientX, clientY }: any) {

        if (!datas.isRotate) {
            return false;
        }
        datas.isRotate = false;

        triggerEvent(moveable, "onRotateEnd", {
            datas: datas.datas,
            clientX,
            clientY,
            target: moveable.state.target!,
            isDrag,
        });
        return isDrag;
    },
    dragGroupControlCondition: dragControlCondition,
    dragGroupControlStart(moveable: MoveableGroup, e: any) {
        const { clientX, clientY, datas, inputEvent } = e;
        const {
            left: parentLeft,
            top: parentTop,
            beforeOrigin: parentBeforeOrigin,
        } = moveable.state;

        triggerChildAble(
            moveable,
            this,
            "dragControlStart",
            { ...e, parentRotate: 0 },
            (child, childDatas) => {
                const { left, top, beforeOrigin } = child.state;
                const childClient = sum(
                    minus([left, top], [parentLeft, parentTop]),
                    minus(beforeOrigin, parentBeforeOrigin),
                );
                const dragDatas = childDatas.drag || (childDatas.drag = {});

                Draggable.dragStart(
                    child,
                    setCustomEvent(childClient[0], childClient[1], dragDatas, inputEvent),
                );
            },
        );

        this.dragControlStart(moveable, e);

        const result = triggerEvent(moveable, "onRotateGroupStart", {
            targets: moveable.props.targets!,
            clientX,
            clientY,
            datas: datas.datas,
        });

        datas.isRotate = result !== false;
        return datas.isDrag;
    },
    dragGroupControl(moveable: MoveableGroup, e: any) {
        const { inputEvent, datas } = e;

        if (!datas.isRotate) {
            return;
        }
        const params = this.dragControl(moveable, e);

        if (!params) {
            return;
        }
        const parentRotate = params.beforeDist;
        const deg = params.beforeDelta;

        const events = triggerChildAble(
            moveable,
            this,
            "dragControl",
            { ...e, parentRotate },
            (child, childDatas, result, i) => {
                const dragDatas = childDatas.drag || (childDatas.drag = {});
                const { prevX, prevY } = getCustomEvent(dragDatas);
                const [clientX, clientY] = rotate([prevX, prevY], deg);

                const dragResult = Draggable.drag(
                    child,
                    setCustomEvent(clientX, clientY, dragDatas, inputEvent),
                );

                result.drag = dragResult;
            },
        );
        const nextParams: OnRotateGroup = {
            targets: moveable.props.targets!,
            events,
            ...params,
        };

        moveable.rotation += params.beforeDelta;
        triggerEvent(moveable, "onRotateGroup", nextParams);
        return nextParams;
    },
    dragGroupControlEnd(moveable: MoveableGroup, e: any) {
        const { clientX, clientY, isDrag, datas } = e;

        if (!datas.isRotate) {
            return;
        }

        this.dragControlEnd(moveable, e);
        triggerChildAble(moveable, this, "dragControlEnd", e);

        const nextParams: OnRotateGroupEnd = {
            targets: moveable.props.targets!,
            clientX,
            clientY,
            isDrag,
            datas: datas.datas,
        };

        triggerEvent(moveable, "onRotateGroupEnd", nextParams);
        return isDrag;
    },
};